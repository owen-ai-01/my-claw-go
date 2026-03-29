/**
 * Smart model router for MyClawGo.
 *
 * Routes each incoming message to the most cost-effective model based on:
 *  1. Rule-based classifier (0ms, no cost)           ← primary
 *  2. Optional LLM classifier using Gemini Flash      ← future
 *
 * Levels:
 *   L1 = simple (greetings, short acks, very simple Q&A)
 *   L2 = medium (day-to-day conversation, Chinese writing, code review)
 *   L3 = complex (architecture, long analysis, tool calls, creative)
 *
 * Paths:
 *   direct = call OpenRouter HTTP API directly (bypass OpenClaw bridge)
 *   bridge = route through OpenClaw bridge (agent memory + tools available)
 */

export type RoutingLevel = 'L1' | 'L2' | 'L3';

export type RoutingDecision = {
  level: RoutingLevel;
  /**
   * path is always 'bridge' — all messages go through OpenClaw bridge
   * to preserve session memory, tools, and agent personality.
   * This field is kept for logging / observability only.
   */
  path: 'bridge';
  model: string;
  reason: string;
  /** explicit user-specified model; if set, classification is bypassed */
  userOverride?: string;
};

// ── Default model assignments ─────────────────────────────────────────────────

function getL1Model(): string {
  return process.env.MYCLAWGO_ROUTER_L1_MODEL || 'openrouter/google/gemini-2.0-flash-exp';
}
function getL2Model(intent: 'chinese' | 'code' | 'general'): string {
  if (intent === 'chinese')
    return process.env.MYCLAWGO_ROUTER_L2_ZH_MODEL || 'openrouter/deepseek/deepseek-v3';
  if (intent === 'code')
    return process.env.MYCLAWGO_ROUTER_L2_CODE_MODEL || 'openrouter/anthropic/claude-haiku-4.5';
  return process.env.MYCLAWGO_ROUTER_L2_MODEL || 'openrouter/anthropic/claude-haiku-4.5';
}
function getL3Model(intent: 'longContext' | 'general'): string {
  if (intent === 'longContext')
    return process.env.MYCLAWGO_ROUTER_L3_LONG_MODEL || 'openrouter/google/gemini-2.5-pro';
  return process.env.MYCLAWGO_ROUTER_L3_MODEL || 'openrouter/anthropic/claude-sonnet-4.6';
}

// ── Rule-based classifier ─────────────────────────────────────────────────────

const GREETING_PATTERNS = [
  /^(hi|hello|hey|嗨|你好|早|晚安|早上好|下午好|哈喽|哈哈|啊|哦|哇|谢谢|谢了|感谢|好的|okay|ok|明白|收到|了解|👍|😊|🙏)[\s!！。.]*$/i,
];
const SIMPLE_ACK_PATTERNS = [
  /^(yes|no|yep|nope|sure|done|good|nice|cool|great|perfect|thanks|thx|ty|对|嗯|对的|是的|好|不是|不|没有|有的|可以|不可以|不行)[\s!！。.]*$/i,
];
const CODE_KEYWORDS = /```|function |def |class |import |require\(|async |await |error:|exception|traceback|syntax error|bug|fix|debug|refactor|代码|报错|调试|修复|接口|API|SQL|query|shell|bash|python|javascript|typescript|rust|golang|java/i;
const ARCHITECTURE_KEYWORDS = /架构|系统设计|技术方案|模块|高并发|分布式|微服务|database design|system design|architecture|design pattern|PRD|需求文档|方案设计|技术选型/i;
const CHINESE_WRITING_KEYWORDS = /写一篇|帮我写|润色|翻译|博客|文章|小红书|公众号|朋友圈|营销文案|copywriting|改写|扩写|缩写|总结一下.*文章|summarize/i;
const TOOL_KEYWORDS = /帮我搜|搜索一下|查一下|浏览器|打开网页|browse|search the web|look up|find me/i;
const LONG_CONTEXT_THRESHOLD = 2000; // chars
const VERY_LONG_CONTEXT_THRESHOLD = 5000; // chars — Gemini Pro territory

function isMostlyChinese(text: string): boolean {
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return chinese / Math.max(1, text.length) > 0.3;
}

function hasCodeFences(text: string): boolean {
  return text.includes('```') || text.includes('~~~');
}

export function routeMessage(params: {
  message: string;
  userModelOverride?: string; // explicit user pick
  agentModel?: string;        // agent's configured model (fallback)
  forceBridge?: boolean;      // always use bridge (e.g. group chat)
}): RoutingDecision {
  const { message, userModelOverride, agentModel, forceBridge = false } = params;

  // 1. User has explicitly chosen a model → respect it
  if (userModelOverride && userModelOverride !== 'auto') {
    return {
      level: 'L3',
      path: 'bridge',
      model: userModelOverride,
      reason: 'user_override',
      userOverride: userModelOverride,
    };
  }

  // 2. Force bridge (e.g. group chats that need agent memory)
  if (forceBridge) {
    return {
      level: 'L3',
      path: 'bridge',
      model: agentModel || getL3Model('general'),
      reason: 'force_bridge',
    };
  }

  const msg = message.trim();
  const len = msg.length;

  // 3. L1: Very short or greeting/ack
  if (len <= 6) {
    return { level: 'L1', path: 'bridge', model: getL1Model(), reason: 'very_short' };
  }
  for (const p of GREETING_PATTERNS) {
    if (p.test(msg)) return { level: 'L1', path: 'bridge', model: getL1Model(), reason: 'greeting' };
  }
  for (const p of SIMPLE_ACK_PATTERNS) {
    if (p.test(msg)) return { level: 'L1', path: 'bridge', model: getL1Model(), reason: 'ack' };
  }

  // 4. L3: Tool-call keywords → must go through bridge (agent tools)
  if (TOOL_KEYWORDS.test(msg)) {
    return { level: 'L3', path: 'bridge', model: agentModel || getL3Model('general'), reason: 'tool_required' };
  }

  // 5. L3: Architecture / system design
  if (ARCHITECTURE_KEYWORDS.test(msg)) {
    return { level: 'L3', path: 'bridge', model: getL3Model('general'), reason: 'architecture' };
  }

  // 6. L3: Very long context → Gemini Pro
  if (len > VERY_LONG_CONTEXT_THRESHOLD) {
    return { level: 'L3', path: 'bridge', model: getL3Model('longContext'), reason: 'very_long_context' };
  }

  // 7. L2: Code-related
  if (CODE_KEYWORDS.test(msg) || hasCodeFences(msg)) {
    return { level: 'L2', path: 'bridge', model: getL2Model('code'), reason: 'code' };
  }

  // 8. L2: Chinese writing / content creation
  if (CHINESE_WRITING_KEYWORDS.test(msg)) {
    return { level: 'L2', path: 'bridge', model: getL2Model('chinese'), reason: 'chinese_writing' };
  }

  // 9. L2: Message length medium
  if (len > LONG_CONTEXT_THRESHOLD) {
    const model = isMostlyChinese(msg) ? getL2Model('chinese') : getL2Model('general');
    return { level: 'L2', path: 'bridge', model, reason: 'long_message' };
  }

  // 10. L1: Short message, no special keywords, mostly Chinese casual chat
  if (len < 80 && isMostlyChinese(msg)) {
    return { level: 'L1', path: 'bridge', model: getL1Model(), reason: 'short_chinese' };
  }

  // 11. L2: Default for everything else
  const model = isMostlyChinese(msg) ? getL2Model('chinese') : getL2Model('general');
  return { level: 'L2', path: 'bridge', model, reason: 'default' };
}
