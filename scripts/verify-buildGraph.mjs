import assert from 'node:assert/strict';
import { buildGraph } from '../src/graph/buildGraph.js';
import {
  branchFamilyLoosePrefixFixtureCorpus,
  metadataParentFixtureCorpus,
  metadataOnlyPrefixFixtureCorpus,
  namedSystemFlagPrefixFixtureCorpus,
  oneMessagePrefixFixtureCorpus,
  prefixBranchFixtureCorpus,
  shortPrefixFixtureCorpus,
  unrelatedLoosePrefixFixtureCorpus,
} from '../src/graph/buildGraph.fixture.mjs';

const graph = buildGraph(prefixBranchFixtureCorpus);

const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
const edges = new Set(graph.edges.map((edge) => `${edge.source}->${edge.target}`));
const segments = graph.nodes.filter((node) => node.type === 'segment');
const branches = graph.nodes.filter((node) => node.type === 'branch');
const chatEnds = graph.nodes.filter((node) => node.type === 'chatEnd');

assert.equal(branches.length, 1, 'fixture should create one BranchNode');
assert.equal(chatEnds.length, 4, 'fixture should create one ChatEndNode per chat');
assert.equal(graph.debug.candidateBranchCount, 1, 'fixture should count one candidate branch');
assert.equal(graph.debug.acceptedBranchCount, 1, 'fixture should accept one candidate branch');
assert.equal(graph.debug.rejectedBranchCount, 0, 'fixture should not reject accepted branch');
assert.equal(graph.debug.candidates.length, 1, 'fixture should expose candidate debug details');
assert.equal(graph.debug.candidates[0].status, 'accepted', 'accepted fixture should expose accepted candidate status');
assert.deepEqual(graph.debug.candidates[0].fileNames, ['A.jsonl', 'B.jsonl', 'C.jsonl'], 'accepted candidate should expose file names');
assert.ok(graph.debug.candidates[0].prefixSamples.length > 0, 'accepted candidate should expose prefix samples');
assert.equal(graph.debug.candidates[0].prefixSamples[0].isStoryContent, true, 'accepted prefix sample should mark story content');

const sharedSegment = segments.find((node) => node.data.subtitle === '共同开头');
assert.ok(sharedSegment, 'fixture should create shared SegmentNode');
assert.equal(sharedSegment.data.startIndex, 0, 'shared SegmentNode should start at m1');
assert.equal(sharedSegment.data.endIndex, 1, 'shared SegmentNode should end at m2');
assert.equal(sharedSegment.data.messageCount, 2, 'shared SegmentNode should contain m1-m2');

const branch = branches[0];
assert.ok(edges.has(`root->${sharedSegment.id}`), 'root should connect to shared SegmentNode');
assert.ok(edges.has(`${sharedSegment.id}->${branch.id}`), 'shared SegmentNode should connect to BranchNode');
assert.equal(branch.data.subtitle, '3 route options', 'BranchNode should show route option count in the node');
assert.equal(branch.data.sharedPrefixRange, '0 - 1', 'BranchNode should expose shared prefix range');
assert.equal(branch.data.routeCount, 3, 'BranchNode should expose branch count');
assert.equal(branch.data.routeOptionCount, 3, 'BranchNode should expose route option count');
assert.deepEqual(branch.data.routeOptions.map((route) => route.label), ['R1', 'R2', 'R3'], 'BranchNode should expose readable route labels');
assert.equal(branch.data.branchRoutes.length, 3, 'BranchNode should expose branch route inspector rows');
assert.deepEqual(
  branch.data.branchRoutes.map((route) => ({
    routeLabel: route.routeLabel,
    fileName: route.fileName,
    nextPreview: route.nextPreview,
    messageCount: route.messageCount,
    chatEnd: route.chatEnd,
  })),
  [
    { routeLabel: 'R1', fileName: 'A.jsonl', nextPreview: 'a3', messageCount: 4, chatEnd: 'ChatEnd · 4 messages' },
    { routeLabel: 'R2', fileName: 'B.jsonl', nextPreview: 'b3', messageCount: 3, chatEnd: 'ChatEnd · 3 messages' },
    { routeLabel: 'R3', fileName: 'C.jsonl', nextPreview: 'c3', messageCount: 5, chatEnd: 'ChatEnd · 5 messages' },
  ],
  'BranchNode should expose next preview and final ChatEnd info per route',
);

const routeSegments = segments.filter((node) => node.data.subtitle === '分支剧情段');
assert.equal(routeSegments.length, 3, 'A/B/C should each create one branch SegmentNode');

for (const fileName of ['A.jsonl', 'B.jsonl', 'C.jsonl']) {
  const segment = routeSegments.find((node) => node.data.fileName === fileName);
  const chatEnd = chatEnds.find((node) => node.data.fileName === fileName);
  assert.ok(segment, `${fileName} should have a branch SegmentNode`);
  assert.ok(chatEnd, `${fileName} should have a ChatEndNode`);
  assert.ok(segment.data.routeLane?.label, `${fileName} SegmentNode should expose its route lane`);
  assert.ok(chatEnd.data.routeLane?.label, `${fileName} ChatEndNode should expose its route lane`);
  assert.ok(edges.has(`${branch.id}->${segment.id}`), `${fileName} SegmentNode should be connected from BranchNode`);
  assert.ok(edges.has(`${segment.id}->${chatEnd.id}`), `${fileName} ChatEndNode should be connected from its SegmentNode`);
}

assert.deepEqual(
  graph.edges
    .filter((edge) => edge.source === branch.id)
    .map((edge) => edge.label),
  ['R1', 'R2', 'R3'],
  'Branch outgoing edges should be labeled with route lanes',
);

const emptyChatEnd = chatEnds.find((node) => node.data.fileName === 'D.jsonl');
assert.ok(emptyChatEnd, 'D should have a ChatEndNode');
assert.equal(emptyChatEnd.data.isEmpty, true, 'D should be marked as Empty Chat');
assert.ok(edges.has(`root->${emptyChatEnd.id}`), 'D Empty ChatEndNode should connect directly from root');

for (const edge of graph.edges) {
  assert.ok(nodesById.has(edge.source), `edge source should exist: ${edge.source}`);
  assert.ok(nodesById.has(edge.target), `edge target should exist: ${edge.target}`);
}

const shortGraph = buildGraph(shortPrefixFixtureCorpus);
const shortBranches = shortGraph.nodes.filter((node) => node.type === 'branch');
const shortChatEnds = shortGraph.nodes.filter((node) => node.type === 'chatEnd');

assert.equal(shortBranches.length, 0, 'short shared prefix should not create a BranchNode');
assert.equal(shortChatEnds.length, 3, 'short rejected chats should remain independent lanes');
assert.equal(shortGraph.debug.candidateBranchCount, 1, 'short fixture should count one candidate branch');
assert.equal(shortGraph.debug.acceptedBranchCount, 0, 'short fixture should accept no branch');
assert.equal(shortGraph.debug.rejectedBranchCount, 1, 'short fixture should reject one branch');
assert.equal(shortGraph.debug.rejectedReasons.prefix_text_too_short, 1, 'short fixture should reject by prefix_text_too_short');
assert.equal(shortGraph.debug.candidates[0].status, 'rejected', 'short fixture should expose rejected candidate status');
assert.equal(shortGraph.debug.candidates[0].reason, 'prefix_text_too_short', 'short fixture should expose rejected reason');
assert.deepEqual(
  shortGraph.debug.candidates[0].fileNames,
  ['short-a.jsonl', 'short-b.jsonl', 'short-c.jsonl'],
  'short rejected candidate should expose file names',
);

const oneMessageGraph = buildGraph(oneMessagePrefixFixtureCorpus);
assert.equal(oneMessageGraph.nodes.filter((node) => node.type === 'branch').length, 0, 'one-message prefix should not create a BranchNode');
assert.equal(oneMessageGraph.debug.candidateBranchCount, 1, 'one-message fixture should count one candidate branch');
assert.equal(oneMessageGraph.debug.rejectedReasons.prefix_too_short, 1, 'one-message fixture should reject by prefix_too_short');

const metadataOnlyGraph = buildGraph(metadataOnlyPrefixFixtureCorpus);
assert.equal(metadataOnlyGraph.nodes.filter((node) => node.type === 'branch').length, 0, 'metadata-only prefix should not create a BranchNode');
assert.equal(metadataOnlyGraph.debug.candidateBranchCount, 1, 'metadata-only fixture should count one candidate branch');
assert.equal(metadataOnlyGraph.debug.rejectedReasons.metadata_only, 1, 'metadata-only fixture should reject by metadata_only');

const namedSystemFlagGraph = buildGraph(namedSystemFlagPrefixFixtureCorpus);
assert.equal(namedSystemFlagGraph.nodes.filter((node) => node.type === 'branch').length, 1, 'named is_system story messages should create a BranchNode');
assert.equal(namedSystemFlagGraph.debug.candidateBranchCount, 1, 'named is_system fixture should count one candidate branch');
assert.equal(namedSystemFlagGraph.debug.acceptedBranchCount, 1, 'named is_system fixture should accept one branch');
assert.equal(namedSystemFlagGraph.debug.rejectedReasons.metadata_only, 0, 'named is_system fixture should not reject by metadata_only');

const branchFamilyLooseGraph = buildGraph(branchFamilyLoosePrefixFixtureCorpus);
const branchFamilyLooseBranches = branchFamilyLooseGraph.nodes.filter((node) => node.type === 'branch');
assert.equal(branchFamilyLooseBranches.length, 1, 'same branch family with a truncated long first message should create one BranchNode');
assert.equal(branchFamilyLooseBranches[0].data.routeCount, 3, 'same branch family should support base + Branch #1 + Branch #2');
assert.equal(branchFamilyLooseGraph.debug.acceptedBranchCount, 1, 'same branch family loose prefix should be accepted');
assert.equal(branchFamilyLooseGraph.debug.candidates[0].sharedPrefixMessages, 3, 'same branch family should keep the shared prefix after loose first-message match');

const unrelatedLooseGraph = buildGraph(unrelatedLoosePrefixFixtureCorpus);
assert.equal(unrelatedLooseGraph.nodes.filter((node) => node.type === 'branch').length, 0, 'unrelated files with loose-only matching text should not merge');
assert.equal(unrelatedLooseGraph.debug.candidateBranchCount, 0, 'unrelated loose-only files should not become branch candidates');

const metadataParentGraph = buildGraph(metadataParentFixtureCorpus);
const metadataParentBranches = metadataParentGraph.nodes.filter((node) => node.type === 'branch');
assert.equal(metadataParentBranches.length, 1, 'ST main_chat parent chain should create one BranchNode without relying on Branch # filenames');
assert.equal(metadataParentBranches[0].data.routeCount, 3, 'ST main_chat parent chain should keep parent + children in one route group');
assert.equal(metadataParentGraph.debug.acceptedBranchCount, 1, 'ST main_chat parent chain should accept the shared branch prefix');
assert.deepEqual(
  metadataParentGraph.debug.candidates[0].fileNames,
  ['Parent Route.jsonl', 'Child Alpha.jsonl', 'Child Beta.jsonl'],
  'ST main_chat parent chain should expose grouped file names',
);

console.log('buildGraph fixture ok');
