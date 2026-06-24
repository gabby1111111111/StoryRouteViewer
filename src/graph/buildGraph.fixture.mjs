const m1 = 'm1：这是一个足够长的共同开局，描述角色相遇的地点、气氛、关系张力以及当前目标，确保不是偶然重复的一句短开场。';
const m2 = 'm2：第二条共同消息继续推进同一段剧情，包含行动、回应和场景细节，用来证明这些聊天确实共享同一条父路径。';
const longIntroFull = `${m1} ${m2} ${m1} ${m2} ${m1} ${m2} ${m1} ${m2}`;
const longIntroShort = `${m1} ${m2} ${m1} ${m2} ${m1} ${m2}`;

export const prefixBranchFixtureCorpus = {
  scope: 'character',
  title: 'Prefix Branch Fixture',
  chatCount: 4,
  totalMessages: 12,
  emptyChats: ['D.jsonl'],
  chats: [
    {
      fileName: 'A.jsonl',
      messages: [message(m1), message(m2), message('a3'), message('a4')],
    },
    {
      fileName: 'B.jsonl',
      messages: [message(m1), message(m2), message('b3')],
    },
    {
      fileName: 'C.jsonl',
      messages: [message(m1), message(m2), message('c3'), message('c4'), message('c5')],
    },
    {
      fileName: 'D.jsonl',
      messages: [],
    },
  ],
};

export const shortPrefixFixtureCorpus = {
  scope: 'character',
  title: 'Short Prefix Fixture',
  chatCount: 3,
  totalMessages: 9,
  emptyChats: [],
  chats: [
    {
      fileName: 'short-a.jsonl',
      messages: [message('hi'), message('ok'), message('a3')],
    },
    {
      fileName: 'short-b.jsonl',
      messages: [message('hi'), message('ok'), message('b3')],
    },
    {
      fileName: 'short-c.jsonl',
      messages: [message('hi'), message('ok'), message('c3')],
    },
  ],
};

export const oneMessagePrefixFixtureCorpus = {
  scope: 'character',
  title: 'One Message Prefix Fixture',
  chatCount: 2,
  totalMessages: 4,
  emptyChats: [],
  chats: [
    {
      fileName: 'one-a.jsonl',
      messages: [message(m1), message('a2')],
    },
    {
      fileName: 'one-b.jsonl',
      messages: [message(m1), message('b2')],
    },
  ],
};

export const metadataOnlyPrefixFixtureCorpus = {
  scope: 'character',
  title: 'Metadata Only Prefix Fixture',
  chatCount: 2,
  totalMessages: 6,
  emptyChats: [],
  chats: [
    {
      fileName: 'metadata-a.jsonl',
      messages: [systemMessage(m1), systemMessage(m2), message('a3')],
    },
    {
      fileName: 'metadata-b.jsonl',
      messages: [systemMessage(m1), systemMessage(m2), message('b3')],
    },
  ],
};

export const namedSystemFlagPrefixFixtureCorpus = {
  scope: 'character',
  title: 'Named System Flag Prefix Fixture',
  chatCount: 2,
  totalMessages: 6,
  emptyChats: [],
  chats: [
    {
      fileName: 'named-system-a.jsonl',
      messages: [systemFlaggedStoryMessage('gabby 28', m1, true), systemFlaggedStoryMessage('谢昭南', m2, false), message('a3')],
    },
    {
      fileName: 'named-system-b.jsonl',
      messages: [systemFlaggedStoryMessage('gabby 28', m1, true), systemFlaggedStoryMessage('谢昭南', m2, false), message('b3')],
    },
  ],
};

export const branchFamilyLoosePrefixFixtureCorpus = {
  scope: 'character',
  title: 'Branch Family Loose Prefix Fixture',
  chatCount: 3,
  totalMessages: 12,
  emptyChats: [],
  chats: [
    {
      fileName: 'Route - 2026-05-07@13h52m01s384ms.jsonl',
      messages: [message(longIntroFull), message(m2), message('shared third message with enough context'), message('base route continues')],
    },
    {
      fileName: 'Route - 2026-05-07@13h52m01s384ms - Branch #1.jsonl',
      messages: [message(longIntroFull), message(m2), message('shared third message with enough context'), message('branch one continues')],
    },
    {
      fileName: 'Route - 2026-05-07@13h52m01s384ms - Branch #2.jsonl',
      messages: [message(longIntroShort), message(m2), message('shared third message with enough context'), message('branch two continues')],
    },
  ],
};

export const unrelatedLoosePrefixFixtureCorpus = {
  scope: 'character',
  title: 'Unrelated Loose Prefix Fixture',
  chatCount: 2,
  totalMessages: 4,
  emptyChats: [],
  chats: [
    {
      fileName: 'Opening A.jsonl',
      messages: [message(longIntroFull), message('a2')],
    },
    {
      fileName: 'Opening B.jsonl',
      messages: [message(longIntroShort), message('b2')],
    },
  ],
};

export const metadataParentFixtureCorpus = {
  scope: 'character',
  title: 'Metadata Parent Fixture',
  chatCount: 3,
  totalMessages: 10,
  emptyChats: [],
  chats: [
    {
      fileName: 'Parent Route.jsonl',
      messages: [message(m1), message(m2), message('parent route continues')],
    },
    {
      fileName: 'Child Alpha.jsonl',
      mainChat: 'Parent Route',
      metadata: { main_chat: 'Parent Route' },
      messages: [message(m1), message(m2), message('alpha branch continues')],
    },
    {
      fileName: 'Child Beta.jsonl',
      mainChat: 'Child Alpha',
      metadata: { main_chat: 'Child Alpha' },
      messages: [message(m1), message(m2), message('beta branch continues')],
    },
  ],
};

function message(mes) {
  return {
    name: 'user',
    is_user: true,
    mes,
  };
}

function systemMessage(mes) {
  return {
    name: 'System',
    role: 'system',
    is_system: true,
    mes,
  };
}

function systemFlaggedStoryMessage(name, mes, is_user) {
  return {
    name,
    is_user,
    is_system: true,
    mes,
  };
}
