#!/usr/bin/env ruby
# frozen_string_literal: true

require "date"
require "json"
require "optparse"
require "time"
require "yaml"

DEFAULT_ROOT = ENV.fetch("PICKAGENT_ORCH_ROOT", File.expand_path("~/lab/orch"))
MERGE_DATE_FIELDS = %w[merged_at merge_completed_at merge_started_at completed_at].freeze
RUN_TIME_FIELDS = %w[fix_started_at review_started_at merge_started_at launched_at completed_at].freeze

def present?(value)
  !value.nil? && !value.to_s.strip.empty?
end

def load_yaml(path)
  return {} unless File.exist?(path)

  YAML.safe_load(
    File.read(path),
    permitted_classes: [Date, Time],
    aliases: true
  ) || {}
rescue Psych::Exception => e
  abort "Cannot parse #{path}: #{e.message}"
end

def with_timezone(timezone)
  previous = ENV["TZ"]
  ENV["TZ"] = timezone if present?(timezone)
  yield
ensure
  ENV["TZ"] = previous
end

def parse_target_date(value)
  Date.iso8601(value)
rescue ArgumentError
  abort "Invalid --date #{value.inspect}; expected YYYY-MM-DD"
end

def parse_time(value, timezone)
  return nil unless present?(value)

  with_timezone(timezone) do
    case value
    when Time
      value.getlocal
    when DateTime
      value.to_time.getlocal
    when Date
      Time.local(value.year, value.month, value.day)
    else
      Time.parse(value.to_s).getlocal
    end
  end
rescue ArgumentError
  nil
end

def local_date(value, timezone)
  parse_time(value, timezone)&.to_date
end

def local_time_label(value, timezone)
  parse_time(value, timezone)&.strftime("%H:%M")
end

def project_id_for(project)
  project["project_id"] || project["id"]
end

def project_index(projects_doc)
  Array(projects_doc["projects"]).each_with_object({}) do |project, index|
    id = project_id_for(project)
    next unless present?(id)

    index[id.to_s] = {
      "id" => id.to_s,
      "path" => project["path"],
      "status" => project["status"],
      "work" => project["work"]
    }
  end
end

def each_task(doc)
  return enum_for(:each_task, doc) unless block_given?

  Array(doc["projects"]).each do |project|
    project_id = project_id_for(project)
    project_path = project["path"]

    Array(project["tasks"]).each do |task|
      yield(project_id.to_s, project_path, task)
    end
  end
end

def first_present(task, fields)
  fields.find { |field| present?(task[field]) }
end

def merged_task?(task)
  task["merge_result"].to_s.upcase == "MERGED" ||
    present?(task["merged_at"]) ||
    present?(task["merge_commit"])
end

def running_status?(status)
  normalized = status.to_s
  normalized == "running" || normalized.end_with?("_running")
end

def pr_label(url)
  return nil unless present?(url)

  match = url.to_s.match(%r{/pull/(\d+)(?:[/?#].*)?$})
  match ? "PR ##{match[1]}" : url.to_s
end

def short_commit(value)
  value.to_s[0, 8]
end

def task_title(task)
  task["title"] || task["source_request"] || "(sans titre)"
end

def normalized_task(project_id, project_path, task, project_meta, timezone, timestamp_field)
  timestamp_value = timestamp_field ? task[timestamp_field] : nil

  {
    "project_id" => project_id,
    "project_path" => project_meta && project_meta["path"] || project_path,
    "id" => task["id"],
    "title" => task_title(task),
    "status" => task["status"],
    "pr_url" => task["pr_url"],
    "pr" => pr_label(task["pr_url"]),
    "merge_commit" => task["merge_commit"],
    "merge_commit_short" => present?(task["merge_commit"]) ? short_commit(task["merge_commit"]) : nil,
    "timestamp_field" => timestamp_field,
    "timestamp" => timestamp_value&.to_s,
    "time" => local_time_label(timestamp_value, timezone),
    "worktree_path" => task["worktree_path"]
  }
end

def collect_merged(finished_doc, projects, target_date, timezone, project_filter)
  items = []

  each_task(finished_doc) do |project_id, project_path, task|
    next if project_filter && project_id != project_filter
    next unless merged_task?(task)

    date_field = first_present(task, MERGE_DATE_FIELDS)
    next unless date_field
    next unless local_date(task[date_field], timezone) == target_date

    items << normalized_task(project_id, project_path, task, projects[project_id], timezone, date_field)
  end

  items.sort_by { |task| [task["project_id"].to_s, task["time"].to_s, task["id"].to_s] }
end

def collect_running(active_doc, projects, timezone, project_filter)
  items = []

  each_task(active_doc) do |project_id, project_path, task|
    next if project_filter && project_id != project_filter
    next unless running_status?(task["status"])

    timestamp_field = first_present(task, RUN_TIME_FIELDS)
    items << normalized_task(project_id, project_path, task, projects[project_id], timezone, timestamp_field)
  end

  items.sort_by { |task| [task["project_id"].to_s, task["status"].to_s, task["time"].to_s, task["id"].to_s] }
end

def group_by_project(items)
  items.each_with_object(Hash.new { |hash, key| hash[key] = [] }) do |item, grouped|
    grouped[item["project_id"]] << item
  end
end

def project_heading(project_id, grouped, projects)
  project_path = projects.dig(project_id, "path") || grouped[project_id].first["project_path"]
  present?(project_path) ? "#{project_id} (#{project_path})" : project_id
end

def format_merge_line(task)
  details = []
  details << task["pr"] if present?(task["pr"])
  details << "commit #{task["merge_commit_short"]}" if present?(task["merge_commit_short"])
  details << task["time"] if present?(task["time"])
  suffix = details.empty? ? "" : " (#{details.join(', ')})"

  "- #{task["id"]}: #{task["title"]}#{suffix}"
end

def format_running_line(task)
  details = []
  details << task["pr"] if present?(task["pr"])
  details << task["time"] if present?(task["time"])
  details << task["worktree_path"] if present?(task["worktree_path"])
  suffix = details.empty? ? "" : " (#{details.join(', ')})"

  "- #{task["id"]} [#{task["status"]}]: #{task["title"]}#{suffix}"
end

def print_grouped(title, grouped, projects, empty_message, formatter)
  puts title
  if grouped.empty?
    puts empty_message
    puts
    return
  end

  grouped.keys.sort.each do |project_id|
    puts project_heading(project_id, grouped, projects)
    grouped[project_id].each { |task| puts formatter.call(task) }
    puts
  end
end

options = {
  "root" => DEFAULT_ROOT,
  "timezone" => "Europe/Paris",
  "json" => false
}

parser = OptionParser.new do |opts|
  opts.banner = "Usage: software_engineering_daily_report.rb [options]"
  opts.on("--root PATH", "Orch workspace root") { |value| options["root"] = value }
  opts.on("--projects PATH", "projet.yaml path") { |value| options["projects"] = value }
  opts.on("--orchestre PATH", "Active orchestre.yaml path") { |value| options["orchestre"] = value }
  opts.on("--finished PATH", "Archived orchestre-finished.yaml path") { |value| options["finished"] = value }
  opts.on("--date YYYY-MM-DD", "Local date to report") { |value| options["date"] = value }
  opts.on("--timezone TZ", "Local timezone, default Europe/Paris") { |value| options["timezone"] = value }
  opts.on("--project PROJECT_ID", "Only report one project") { |value| options["project"] = value }
  opts.on("--json", "Print JSON instead of text") { options["json"] = true }
  opts.on("-h", "--help", "Show help") do
    puts opts
    exit
  end
end

parser.parse!(ARGV)

root = options["root"]
timezone = options["timezone"]
target_date = with_timezone(timezone) do
  options["date"] ? parse_target_date(options["date"]) : Date.today
end

paths = {
  "projects" => options["projects"] || File.join(root, "projet.yaml"),
  "orchestre" => options["orchestre"] || File.join(root, "orchestre.yaml"),
  "finished" => options["finished"] || File.join(root, "orchestre-finished.yaml")
}

projects = project_index(load_yaml(paths["projects"]))
active_doc = load_yaml(paths["orchestre"])
finished_doc = load_yaml(paths["finished"])
project_filter = options["project"]&.to_s

merged = collect_merged(finished_doc, projects, target_date, timezone, project_filter)
running = collect_running(active_doc, projects, timezone, project_filter)
merged_grouped = group_by_project(merged)
running_grouped = group_by_project(running)

if options["json"]
  puts JSON.pretty_generate(
    {
      "date" => target_date.iso8601,
      "timezone" => timezone,
      "paths" => paths,
      "merged_prs" => merged_grouped,
      "running" => running_grouped
    }
  )
  exit
end

puts "Bilan software engineering - #{target_date.iso8601} (#{timezone})"
puts
print_grouped(
  "PR mergees aujourd'hui",
  merged_grouped,
  projects,
  "Aucune PR mergee aujourd'hui.",
  method(:format_merge_line)
)
print_grouped(
  "Encore en cours",
  running_grouped,
  projects,
  "Rien en cours pour le moment.",
  method(:format_running_line)
)
