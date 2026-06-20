function isLinkTriggeredAgent(node) {
  return node?.type === 'agent'
    && Boolean(node.id)
    && node.enabled !== false
    && node.triggerType === 'link';
}

function isLinkTriggeredNode(node) {
  return isLinkTriggeredAgent(node)
    || (node?.type === 'executable' && Boolean(node.id) && node.enabled !== false);
}

function linkedRunnableNodes(loop, fromNodeId, visited = new Set()) {
  if (!loop || !Array.isArray(loop.nodes) || !Array.isArray(loop.edges)) return [];
  const nodesById = new Map(loop.nodes.map((node) => [node.id, node]));
  const seen = visited instanceof Set ? visited : new Set(visited || []);
  const targets = [];
  const targetIds = new Set();

  for (const edge of loop.edges) {
    if (edge?.from !== fromNodeId || !edge.to || targetIds.has(edge.to) || seen.has(edge.to)) continue;
    const node = nodesById.get(edge.to);
    if (!isLinkTriggeredNode(node)) continue;
    targetIds.add(edge.to);
    targets.push(node);
  }

  return targets;
}

function linkedAgentNodes(loop, fromNodeId, visited = new Set()) {
  return linkedRunnableNodes(loop, fromNodeId, visited)
    .filter((node) => node.type === 'agent');
}

function shouldTriggerLinkedTargets(code, signal) {
  return code === 0 && !signal;
}

module.exports = {
  isLinkTriggeredAgent,
  isLinkTriggeredNode,
  linkedAgentNodes,
  linkedRunnableNodes,
  shouldTriggerLinkedTargets,
};
