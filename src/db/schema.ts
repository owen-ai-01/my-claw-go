import { boolean, integer, jsonb, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	role: text('role'),
	banned: boolean('banned'),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires'),
	customerId: text('customer_id'),
	utmSource: text('utm_source'),
}, (table) => ({
	userIdIdx: index("user_id_idx").on(table.id),
	userCustomerIdIdx: index("user_customer_id_idx").on(table.customerId),
	userRoleIdx: index("user_role_idx").on(table.role),
}));

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	impersonatedBy: text('impersonated_by')
}, (table) => ({
	sessionTokenIdx: index("session_token_idx").on(table.token),
	sessionUserIdIdx: index("session_user_id_idx").on(table.userId),
}));

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
}, (table) => ({
	accountUserIdIdx: index("account_user_id_idx").on(table.userId),
	accountAccountIdIdx: index("account_account_id_idx").on(table.accountId),
	accountProviderIdIdx: index("account_provider_id_idx").on(table.providerId),
}));

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at')
});

export const payment = pgTable("payment", {
	id: text("id").primaryKey(),
	priceId: text('price_id').notNull(),
	type: text('type').notNull(),
	scene: text('scene'), // payment scene: 'lifetime', 'credit', 'subscription'
	interval: text('interval'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	customerId: text('customer_id').notNull(),
	subscriptionId: text('subscription_id'),
	sessionId: text('session_id'),
	invoiceId: text('invoice_id').unique(), // unique constraint for avoiding duplicate processing
	status: text('status').notNull(),
	paid: boolean('paid').notNull().default(false), // indicates whether payment is completed (set in invoice.paid event)
	periodStart: timestamp('period_start'),
	periodEnd: timestamp('period_end'),
	cancelAtPeriodEnd: boolean('cancel_at_period_end'),
	trialStart: timestamp('trial_start'),
	trialEnd: timestamp('trial_end'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
	paymentTypeIdx: index("payment_type_idx").on(table.type),
	paymentSceneIdx: index("payment_scene_idx").on(table.scene),
	paymentPriceIdIdx: index("payment_price_id_idx").on(table.priceId),
	paymentUserIdIdx: index("payment_user_id_idx").on(table.userId),
	paymentCustomerIdIdx: index("payment_customer_id_idx").on(table.customerId),
	paymentStatusIdx: index("payment_status_idx").on(table.status),
	paymentPaidIdx: index("payment_paid_idx").on(table.paid),
	paymentSubscriptionIdIdx: index("payment_subscription_id_idx").on(table.subscriptionId),
	paymentSessionIdIdx: index("payment_session_id_idx").on(table.sessionId),
	paymentInvoiceIdIdx: index("payment_invoice_id_idx").on(table.invoiceId),
}));

export const userCredit = pgTable("user_credit", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	currentCredits: integer("current_credits").notNull().default(0),
	lastRefreshAt: timestamp("last_refresh_at"), // deprecated
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	userCreditUserIdIdx: index("user_credit_user_id_idx").on(table.userId),
}));

export const creditTransaction = pgTable("credit_transaction", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	type: text("type").notNull(),
	description: text("description"),
	amount: integer("amount").notNull(),
	remainingAmount: integer("remaining_amount"),
	paymentId: text("payment_id"), // field name is paymentId, but actually it's invoiceId
	expirationDate: timestamp("expiration_date"),
	expirationDateProcessedAt: timestamp("expiration_date_processed_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	creditTransactionUserIdIdx: index("credit_transaction_user_id_idx").on(table.userId),
	creditTransactionTypeIdx: index("credit_transaction_type_idx").on(table.type),
}));

export const runtimeTask = pgTable("runtime_tasks", {
  id:          text("id").primaryKey(),
  sessionId:   text("session_id").notNull(),
  message:     text("message").notNull(),
  isCommand:   boolean("is_command").notNull().default(false),
  status:      text("status").notNull().default("queued"),
  reply:       text("reply"),
  error:       text("error"),
  retryCount:  integer("retry_count").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt:   timestamp("started_at", { withTimezone: true }),
  finishedAt:  timestamp("finished_at", { withTimezone: true }),
}, (table) => ({
  runtimeTaskSessionIdx:   index("runtime_task_session_idx").on(table.sessionId),
  runtimeTaskStatusIdx:    index("runtime_task_status_idx").on(table.status),
  runtimeTaskCreatedAtIdx: index("runtime_task_created_at_idx").on(table.createdAt),
}));

export const userAgent = pgTable("user_agent", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentKey: text("agent_key").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  isDefault: boolean("is_default").notNull().default(false),
  runtimeAgentId: text("runtime_agent_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userAgentUserIdx: index("user_agent_user_idx").on(table.userId),
  userAgentUserAgentKeyIdx: index("user_agent_user_agent_key_idx").on(table.userId, table.agentKey),
  userAgentUserSlugIdx: index("user_agent_user_slug_idx").on(table.userId, table.slug),
  userAgentUserDefaultIdx: index("user_agent_user_default_idx").on(table.userId, table.isDefault),
}));

export const userAgentTelegramBot = pgTable("user_agent_telegram_bot", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  userAgentId: text("user_agent_id").notNull().references(() => userAgent.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default("pending"),
  botTokenEncrypted: text("bot_token_encrypted"),
  botUsername: text("bot_username"),
  botTelegramId: text("bot_telegram_id"),
  webhookPath: text("webhook_path"),
  webhookSecret: text("webhook_secret"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userAgentTelegramBotUserIdx: index("user_agent_telegram_bot_user_idx").on(table.userId),
  userAgentTelegramBotAgentIdx: index("user_agent_telegram_bot_agent_idx").on(table.userAgentId),
  userAgentTelegramBotStatusIdx: index("user_agent_telegram_bot_status_idx").on(table.status),
  userAgentTelegramBotWebhookPathIdx: index("user_agent_telegram_bot_webhook_path_idx").on(table.webhookPath),
}));

export const userChatMessage = pgTable("user_chat_message", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentId: text("agent_id").notNull().default("main"),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  status: text("status").notNull().default('done'), // pending | running | done | failed
  taskId: text("task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userChatMessageUserIdx: index("user_chat_message_user_idx").on(table.userId),
  userChatMessageUserAgentIdx: index("user_chat_message_user_agent_idx").on(table.userId, table.agentId),
  userChatMessageCreatedAtIdx: index("user_chat_message_created_at_idx").on(table.createdAt),
}));

export const userChatTask = pgTable("user_chat_task", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentId: text("agent_id").notNull().default("main"),
  status: text("status").notNull().default('queued'),
  userMessageId: text("user_message_id").notNull().references(() => userChatMessage.id, { onDelete: 'cascade' }),
  assistantMessageId: text("assistant_message_id").notNull().references(() => userChatMessage.id, { onDelete: 'cascade' }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => ({
  userChatTaskUserIdx: index("user_chat_task_user_idx").on(table.userId),
  userChatTaskUserAgentIdx: index("user_chat_task_user_agent_idx").on(table.userId, table.agentId),
  userChatTaskStatusIdx: index("user_chat_task_status_idx").on(table.status),
  userChatTaskCreatedAtIdx: index("user_chat_task_created_at_idx").on(table.createdAt),
}));

export const userChatBillingAudit = pgTable("user_chat_billing_audit", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentId: text("agent_id").notNull().default("main"),
  model: text("model"),
  pricingModelKey: text("pricing_model_key"),
  source: text("source").notNull(), // actual|estimated|fallback
  status: text("status").notNull().default("ok"), // ok|failed
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  usdCost: text("usd_cost"),
  creditsDeducted: integer("credits_deducted"),
  error: text("error"),
  metaJson: jsonb("meta_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userChatBillingAuditUserIdx: index("user_chat_billing_audit_user_idx").on(table.userId),
  userChatBillingAuditUserAgentIdx: index("user_chat_billing_audit_user_agent_idx").on(table.userId, table.agentId),
  userChatBillingAuditCreatedAtIdx: index("user_chat_billing_audit_created_at_idx").on(table.createdAt),
  userChatBillingAuditStatusIdx: index("user_chat_billing_audit_status_idx").on(table.status),
}));

export const userChannelBinding = pgTable("user_channel_binding", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  userAgentId: text("user_agent_id").notNull().references(() => userAgent.id, { onDelete: 'cascade' }),
  telegramBotId: text("telegram_bot_id").references(() => userAgentTelegramBot.id, { onDelete: 'cascade' }),
  channel: text("channel").notNull().default("telegram"),
  status: text("status").notNull().default("pending"),
  externalChatId: text("external_chat_id"),
  externalUserId: text("external_user_id"),
  externalUsername: text("external_username"),
  externalDisplayName: text("external_display_name"),
  bindCode: text("bind_code"),
  bindCodeExpiresAt: timestamp("bind_code_expires_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userChannelBindingUserIdx: index("user_channel_binding_user_idx").on(table.userId),
  userChannelBindingAgentIdx: index("user_channel_binding_agent_idx").on(table.userAgentId),
  userChannelBindingBotIdx: index("user_channel_binding_bot_idx").on(table.telegramBotId),
  userChannelBindingChannelIdx: index("user_channel_binding_channel_idx").on(table.channel),
  userChannelBindingStatusIdx: index("user_channel_binding_status_idx").on(table.status),
  userChannelBindingChatIdx: index("user_channel_binding_chat_idx").on(table.externalChatId),
  userChannelBindingBindCodeIdx: index("user_channel_binding_bind_code_idx").on(table.bindCode),
}));
