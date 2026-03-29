import { resolveChatModelSelection } from '../src/lib/myclawgo/user-chat';

function printCase(name: string, fn: () => unknown) {
  try {
    const result = fn();
    console.log(`\n[${name}]`);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(`\n[${name}] ERROR`);
    console.log(e instanceof Error ? e.message : String(e));
  }
}

// 1) user selected explicit model => bypass router
printCase('1-user-selected-explicit-model', () =>
  resolveChatModelSelection({
    message: '帮我写一段周报',
    userModelOverride: 'openrouter/anthropic/claude-sonnet-4.6',
    routerEnabled: true,
  })
);

// 2) auto => router picks model
printCase('2-auto-uses-router', () =>
  resolveChatModelSelection({
    message: '你好',
    userModelOverride: 'auto',
    routerEnabled: true,
  })
);

// 3) auto + router failure => fallback to default model (resolvedModel undefined)
printCase('3-auto-router-fail-fallback-default', () =>
  resolveChatModelSelection({
    message: '系统架构怎么设计',
    userModelOverride: 'auto',
    routerEnabled: true,
    routeFn: (() => {
      throw new Error('mock route failure');
    }) as any,
  })
);
