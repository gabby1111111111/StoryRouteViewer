import assert from 'node:assert/strict';
import { buildGraph } from '../src/graph/buildGraph.js';
import {
  branchFamilyLoosePrefixFixtureCorpus,
  filenameFamilyWithoutBranchSuffixFixtureCorpus,
  metadataBranchLinksFixtureCorpus,
  metadataMissingParentFixtureCorpus,
  metadataNestedBranchLinksFixtureCorpus,
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
assert.equal(branch.data.branchSource, 'exact_prefix', 'BranchNode should expose text-prefix source');
assert.equal(branch.data.branchSourceLabel, 'Text prefix', 'BranchNode should expose readable text-prefix source');
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
    target: route.navigationTarget,
  })),
  [
    {
      routeLabel: 'R1',
      fileName: 'A.jsonl',
      nextPreview: 'a3',
      messageCount: 4,
      chatEnd: 'ChatEnd · 4 messages',
      target: { chatId: 'A', fileName: 'A.jsonl', messageIndex: 2, fallbackMessageIndex: 3 },
    },
    {
      routeLabel: 'R2',
      fileName: 'B.jsonl',
      nextPreview: 'b3',
      messageCount: 3,
      chatEnd: 'ChatEnd · 3 messages',
      target: { chatId: 'B', fileName: 'B.jsonl', messageIndex: 2, fallbackMessageIndex: 2 },
    },
    {
      routeLabel: 'R3',
      fileName: 'C.jsonl',
      nextPreview: 'c3',
      messageCount: 5,
      chatEnd: 'ChatEnd · 5 messages',
      target: { chatId: 'C', fileName: 'C.jsonl', messageIndex: 2, fallbackMessageIndex: 4 },
    },
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
assert.equal(emptyChatEnd.data.graphReason, 'empty_chat', 'empty chat should expose graph reason');
assert.equal(emptyChatEnd.data.graphReasonLabel, 'Empty chat', 'empty chat should expose readable graph reason');
assert.ok(edges.has(`root->${emptyChatEnd.id}`), 'D Empty ChatEndNode should connect directly from root');
assert.equal(graph.debug.unmergedReasons.empty_chat, 1, 'empty chat should be counted in unmerged debug reasons');

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
assert.equal(shortGraph.debug.unmergedReasons.prefix_text_too_short, 3, 'short rejected chats should be counted by rejection reason');
assert.deepEqual(
  shortGraph.debug.candidates[0].fileNames,
  ['short-a.jsonl', 'short-b.jsonl', 'short-c.jsonl'],
  'short rejected candidate should expose file names',
);
const shortRouteSegments = shortGraph.nodes.filter((node) => node.type === 'segment');
assert.equal(shortRouteSegments[0].data.graphReason, 'prefix_text_too_short', 'short rejected route should expose graph reason on SegmentNode');
assert.equal(shortRouteSegments[0].data.graphReasonLabel, 'Rejected: prefix text too short', 'short rejected route should expose readable graph reason');

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
assert.equal(branchFamilyLooseBranches[0].data.branchSource, 'filename_family', 'filename family branch should expose filename_family source');
assert.equal(branchFamilyLooseBranches[0].data.branchSourceLabel, 'Filename family', 'filename family branch should expose readable source label');
assert.equal(branchFamilyLooseBranches[0].data.branchSourceRisk, 'high', 'filename family branch should expose high risk');
assert.equal(branchFamilyLooseBranches[0].data.branchSourceRiskLabel, 'High risk fallback', 'filename family branch should expose readable risk label');
assert.equal(branchFamilyLooseGraph.debug.acceptedBranchCount, 1, 'same branch family loose prefix should be accepted');
assert.equal(branchFamilyLooseGraph.debug.candidates[0].source, 'filename_family', 'filename family candidate debug should expose source');
assert.equal(branchFamilyLooseGraph.debug.candidates[0].sourceRisk, 'high', 'filename family candidate debug should expose high risk');
assert.equal(branchFamilyLooseGraph.debug.candidates[0].sharedPrefixMessages, 3, 'same branch family should keep the shared prefix after loose first-message match');

const filenameFamilyWithoutBranchSuffixGraph = buildGraph(filenameFamilyWithoutBranchSuffixFixtureCorpus);
assert.equal(
  filenameFamilyWithoutBranchSuffixGraph.nodes.filter((node) => node.type === 'branch').length,
  0,
  'same filename family without a Branch suffix should not use filename_family fallback',
);
assert.equal(
  filenameFamilyWithoutBranchSuffixGraph.debug.candidateBranchCount,
  0,
  'same filename family without a Branch suffix should not become a branch candidate',
);

const unrelatedLooseGraph = buildGraph(unrelatedLoosePrefixFixtureCorpus);
assert.equal(unrelatedLooseGraph.nodes.filter((node) => node.type === 'branch').length, 0, 'unrelated files with loose-only matching text should not merge');
assert.equal(unrelatedLooseGraph.debug.candidateBranchCount, 0, 'unrelated loose-only files should not become branch candidates');
assert.equal(unrelatedLooseGraph.debug.unmergedReasons.single_route_group, 2, 'unrelated independent files should expose single-route unmerged reasons');

const metadataParentGraph = buildGraph(metadataParentFixtureCorpus);
const metadataParentBranches = metadataParentGraph.nodes.filter((node) => node.type === 'branch');
assert.equal(metadataParentBranches.length, 1, 'ST main_chat parent chain should create one BranchNode without relying on Branch # filenames');
assert.equal(metadataParentBranches[0].data.routeCount, 3, 'ST main_chat parent chain should keep parent + children in one route group');
assert.equal(metadataParentBranches[0].data.branchSource, 'st_metadata', 'ST metadata branch should expose st_metadata source');
assert.equal(metadataParentBranches[0].data.branchSourceLabel, 'ST metadata', 'ST metadata branch should expose readable source label');
assert.equal(metadataParentBranches[0].data.stBranchPoint, 'Parent Route.jsonl #1', 'ST main_chat branch should infer parent message index from shared prefix');
assert.equal(metadataParentBranches[0].data.stBranchPointSource, 'main_chat_inferred', 'ST main_chat inferred branch should expose inferred source');
assert.deepEqual(
  metadataParentBranches[0].data.navigationTarget,
  { chatId: 'Parent Route', fileName: 'Parent Route.jsonl', messageIndex: 1, fallbackMessageIndex: 0 },
  'ST main_chat inferred branch jump should target inferred parent chat message',
);
assert.equal(metadataParentGraph.debug.acceptedBranchCount, 1, 'ST main_chat parent chain should accept the shared branch prefix');
assert.equal(metadataParentGraph.debug.candidates[0].source, 'st_metadata', 'ST metadata candidate debug should expose source');
assert.equal(metadataParentGraph.debug.candidates[0].stBranchPoint, 'Parent Route.jsonl #1', 'ST metadata candidate debug should expose inferred parent message index');
assert.deepEqual(
  metadataParentGraph.debug.candidates[0].fileNames,
  ['Parent Route.jsonl', 'Child Alpha.jsonl', 'Child Beta.jsonl'],
  'ST main_chat parent chain should expose grouped file names',
);

const metadataBranchLinksGraph = buildGraph(metadataBranchLinksFixtureCorpus);
const metadataBranchLinksBranches = metadataBranchLinksGraph.nodes.filter((node) => node.type === 'branch');
assert.equal(metadataBranchLinksBranches.length, 1, 'ST extra.branches links should create one BranchNode');
assert.equal(metadataBranchLinksBranches[0].data.branchSource, 'st_metadata', 'ST extra.branches branch should expose st_metadata source');
assert.equal(metadataBranchLinksBranches[0].data.stBranchPoint, 'Linked Parent.jsonl #1', 'ST extra.branches branch should expose parent message index');
assert.equal(metadataBranchLinksBranches[0].data.stBranchPointSource, 'extra.branches', 'ST extra.branches branch should expose explicit source');
assert.deepEqual(
  metadataBranchLinksBranches[0].data.stBranchChildren,
  ['Linked Alpha.jsonl', 'Linked Beta.jsonl'],
  'ST extra.branches branch should expose linked child chats',
);
assert.deepEqual(
  metadataBranchLinksBranches[0].data.navigationTarget,
  { chatId: 'Linked Parent', fileName: 'Linked Parent.jsonl', messageIndex: 1, fallbackMessageIndex: 0 },
  'ST extra.branches branch jump should target the parent chat message',
);
assert.equal(
  metadataBranchLinksGraph.debug.candidates[0].stBranchPoint,
  'Linked Parent.jsonl #1',
  'ST extra.branches candidate debug should expose parent message index',
);

const metadataNestedBranchLinksGraph = buildGraph(metadataNestedBranchLinksFixtureCorpus);
const metadataNestedBranchLinksBranches = metadataNestedBranchLinksGraph.nodes.filter((node) => node.type === 'branch');
assert.equal(metadataNestedBranchLinksBranches.length, 2, 'nested ST extra.branches links should create two BranchNodes');
assert.deepEqual(
  metadataNestedBranchLinksBranches.map((node) => node.data.stBranchPoint),
  ['Nested Parent.jsonl #1', 'Nested Alpha.jsonl #3'],
  'nested ST BranchNodes should target their own parent message index',
);
assert.deepEqual(
  metadataNestedBranchLinksBranches.map((node) => node.data.navigationTarget),
  [
    { chatId: 'Nested Parent', fileName: 'Nested Parent.jsonl', messageIndex: 1, fallbackMessageIndex: 0 },
    { chatId: 'Nested Alpha', fileName: 'Nested Alpha.jsonl', messageIndex: 3, fallbackMessageIndex: 0 },
  ],
  'nested ST BranchNodes should jump to their own parent chat messages',
);

const metadataMissingParentGraph = buildGraph(metadataMissingParentFixtureCorpus);
const metadataMissingParentBranches = metadataMissingParentGraph.nodes.filter((node) => node.type === 'branch');
assert.equal(metadataMissingParentBranches.length, 1, 'ST main_chat siblings should create one BranchNode even when the parent chat file is missing');
assert.equal(metadataMissingParentBranches[0].data.routeCount, 2, 'ST main_chat missing-parent siblings should keep both child chats in one route group');
assert.equal(metadataMissingParentBranches[0].data.routeOptionCount, 2, 'two child chats under the same missing parent should become two route options');
assert.equal(metadataMissingParentGraph.debug.acceptedBranchCount, 1, 'ST main_chat missing-parent siblings should accept the shared branch prefix');
assert.equal(metadataMissingParentBranches[0].data.stBranchPoint, '', 'ST main_chat missing-parent branch should not infer a missing parent jump target');
assert.deepEqual(
  metadataMissingParentGraph.debug.candidates[0].fileNames,
  ['Child Only Alpha.jsonl', 'Child Only Beta.jsonl'],
  'ST main_chat missing-parent grouping should expose sibling child file names',
);

console.log('buildGraph fixture ok');
