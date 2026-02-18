export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "WhatsApp API Service",
    version: "0.1.0",
    description:
      "REST API for WhatsApp messaging and session management. All /api/v1 endpoints require x-api-key.",
  },
  servers: [
    {
      url: process.env.BASE_URL || "http://localhost:3000",
      description: "Primary server",
    },
  ],
  tags: [
    { name: "Messages" },
    { name: "Sessions" },
    { name: "Chats" },
    { name: "Contacts" },
    { name: "Groups" },
    { name: "Calls" },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["ok", "error"],
      },
      QueueResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              jobId: { type: "string" },
              queued: { type: "boolean" },
            },
            required: ["jobId", "queued"],
          },
        },
        required: ["ok", "data"],
      },
      SessionState: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          status: {
            type: "string",
            enum: [
              "connecting",
              "qr",
              "authenticated",
              "ready",
              "disconnected",
              "auth_failure",
              "unknown",
            ],
          },
          reconnectAttempts: { type: "number" },
          updatedAt: { type: "string", format: "date-time" },
          lastError: { type: "string", nullable: true },
        },
      },
      SendTextRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session. Uses active session when omitted." },
          to: { type: "string", example: "15551234567" },
          text: { type: "string", example: "Hello from API" },
        },
        required: ["to", "text"],
      },
      SendMediaRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session. Uses active session when omitted." },
          to: { type: "string", example: "15551234567" },
          mediaUrl: { type: "string", format: "uri", example: "https://example.com/image.jpg" },
          caption: { type: "string", example: "Invoice" },
          filename: { type: "string", example: "invoice.jpg" },
        },
        required: ["to", "mediaUrl"],
      },
      SendLocationRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          to: { type: "string", example: "15551234567" },
          latitude: { type: "number", example: 37.7749 },
          longitude: { type: "number", example: -122.4194 },
          description: { type: "string", example: "San Francisco" },
        },
        required: ["to", "latitude", "longitude"],
      },
      SendPollRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          to: { type: "string", example: "15551234567" },
          name: { type: "string", example: "Favorite color?" },
          options: { type: "array", items: { type: "string" }, example: ["Red", "Blue", "Green"] },
          allowMultipleAnswers: { type: "boolean", example: false },
        },
        required: ["to", "name", "options"],
      },
      SendContactRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          to: { type: "string", example: "15551234567" },
          contactId: { type: "string", example: "15559876543@c.us" },
        },
        required: ["to", "contactId"],
      },
      SendReactionRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          messageId: { type: "string" },
          reaction: { type: "string", example: "👍", description: "Emoji reaction. Empty string to remove." },
        },
        required: ["messageId", "reaction"],
      },
      MessageActionRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          messageId: { type: "string" },
          action: {
            type: "string",
            enum: ["reply", "forward", "delete", "star", "unstar", "react", "edit", "pin", "unpin", "downloadMedia"],
          },
          content: { type: "string", description: "For reply/edit actions" },
          chatId: { type: "string", description: "For forward action" },
          reaction: { type: "string", description: "For react action" },
          everyone: { type: "boolean", description: "For delete action" },
          duration: { type: "number", description: "For pin action (seconds)" },
        },
        required: ["messageId", "action"],
      },
      ChatActionRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          chatId: { type: "string" },
          action: {
            type: "string",
            enum: ["sendSeen", "archive", "unarchive", "mute", "unmute", "pin", "unpin", "delete", "clearMessages", "sendTyping", "sendRecording", "clearState"],
          },
          duration: { type: "number", description: "Mute duration in seconds" },
        },
        required: ["chatId", "action"],
      },
      GroupActionRequest: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          action: {
            type: "string",
            enum: ["addParticipants", "removeParticipants", "promoteParticipants", "demoteParticipants", "setSubject", "setDescription", "getInviteCode", "revokeInvite", "leave"],
          },
          participants: { type: "array", items: { type: "string" }, description: "For participant actions" },
          subject: { type: "string", description: "For setSubject" },
          description: { type: "string", description: "For setDescription" },
        },
        required: ["action"],
      },
      Chat: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isGroup: { type: "boolean" },
          unreadCount: { type: "number" },
          timestamp: { type: "number" },
          lastMessage: { type: "string" },
          archived: { type: "boolean" },
          pinned: { type: "boolean" },
        },
      },
      Contact: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          pushname: { type: "string" },
          number: { type: "string" },
          isUser: { type: "boolean" },
          isGroup: { type: "boolean" },
          isBlocked: { type: "boolean" },
          isMyContact: { type: "boolean" },
          isBusiness: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/api/v1/messages/text": {
      post: {
        tags: ["Messages"],
        summary: "Queue a text message",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendTextRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Queued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueueResponse" },
              },
            },
          },
          "400": {
            description: "Invalid payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Invalid API key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "503": {
            description: "Queue unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/messages/media": {
      post: {
        tags: ["Messages"],
        summary: "Queue a media message from URL",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendMediaRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Queued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueueResponse" },
              },
            },
          },
          "400": {
            description: "Invalid payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Invalid API key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "503": {
            description: "Queue unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/sessions": {
      get: {
        tags: ["Sessions"],
        summary: "List sessions",
        security: [{ ApiKeyAuth: [] }],
        responses: {
          "200": {
            description: "Session list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: {
                        defaultSessionId: { type: "string" },
                        sessions: {
                          type: "array",
                          items: { $ref: "#/components/schemas/SessionState" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Invalid API key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/sessions/{id}/status": {
      get: {
        tags: ["Sessions"],
        summary: "Get session status",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Session status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: {
                        session: { $ref: "#/components/schemas/SessionState" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Invalid API key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/sessions/{id}/qr": {
      get: {
        tags: ["Sessions"],
        summary: "Get QR code as PNG",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "QR PNG image",
            content: {
              "image/png": {
                schema: {
                  type: "string",
                  format: "binary",
                },
              },
            },
          },
          "401": {
            description: "Invalid API key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "QR not available",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/sessions/{id}/logout": {
      post: {
        tags: ["Sessions"],
        summary: "Logout a session",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Logged out",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: {
                        sessionId: { type: "string" },
                        loggedOut: { type: "boolean" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Invalid API key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "500": {
            description: "Logout failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/sessions/{id}/reconnect": {
      post: {
        tags: ["Sessions"],
        summary: "Reconnect a session",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Reconnecting",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: {
                        sessionId: { type: "string" },
                        reconnecting: { type: "boolean" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Invalid API key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "500": {
            description: "Reconnect failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/messages/location": {
      post: {
        tags: ["Messages"],
        summary: "Send a location message",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SendLocationRequest" } } },
        },
        responses: {
          "200": { description: "Sent", content: { "application/json": { schema: { $ref: "#/components/schemas/QueueResponse" } } } },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/messages/poll": {
      post: {
        tags: ["Messages"],
        summary: "Send a poll",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SendPollRequest" } } },
        },
        responses: {
          "200": { description: "Sent", content: { "application/json": { schema: { $ref: "#/components/schemas/QueueResponse" } } } },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/messages/contact": {
      post: {
        tags: ["Messages"],
        summary: "Send a contact card",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SendContactRequest" } } },
        },
        responses: {
          "200": { description: "Sent", content: { "application/json": { schema: { $ref: "#/components/schemas/QueueResponse" } } } },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/messages/reaction": {
      post: {
        tags: ["Messages"],
        summary: "React to a message",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SendReactionRequest" } } },
        },
        responses: {
          "200": { description: "Reacted", content: { "application/json": { schema: { $ref: "#/components/schemas/QueueResponse" } } } },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/messages/actions": {
      post: {
        tags: ["Messages"],
        summary: "Perform a message action (reply, forward, delete, star, react, edit, pin, download)",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/MessageActionRequest" } } },
        },
        responses: {
          "200": { description: "Action performed", content: { "application/json": { schema: { $ref: "#/components/schemas/QueueResponse" } } } },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/chats": {
      get: {
        tags: ["Chats"],
        summary: "List all chats",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "sessionId", in: "query", schema: { type: "string" }, description: "Session ID (defaults to active)" },
        ],
        responses: {
          "200": {
            description: "Chats list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: { chats: { type: "array", items: { $ref: "#/components/schemas/Chat" } } },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/chats/{id}/messages": {
      get: {
        tags: ["Chats"],
        summary: "Get messages from a specific chat",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "sessionId", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        ],
        responses: {
          "200": { description: "Chat messages" },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/chats/actions": {
      post: {
        tags: ["Chats"],
        summary: "Perform a chat action (archive, mute, pin, sendSeen, etc.)",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ChatActionRequest" } } },
        },
        responses: {
          "200": { description: "Action performed" },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/contacts": {
      get: {
        tags: ["Contacts"],
        summary: "List all contacts",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "sessionId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Contacts list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: { contacts: { type: "array", items: { $ref: "#/components/schemas/Contact" } } },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/contacts/{id}": {
      get: {
        tags: ["Contacts"],
        summary: "Get a specific contact with profile picture and about",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "sessionId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Contact details" },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/groups": {
      post: {
        tags: ["Groups"],
        summary: "Create a new group",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  sessionId: { type: "string" },
                  name: { type: "string" },
                  participants: { type: "array", items: { type: "string" } },
                },
                required: ["name", "participants"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Group created" },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/groups/{id}": {
      get: {
        tags: ["Groups"],
        summary: "Get group info (name, description, participants, admins)",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "sessionId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Group info" },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/groups/{id}/actions": {
      post: {
        tags: ["Groups"],
        summary: "Manage group (add/remove participants, set subject/description, invite codes, leave)",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/GroupActionRequest" } } },
        },
        responses: {
          "200": { description: "Action performed" },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/calls": {
      get: {
        tags: ["Calls"],
        summary: "Get recent incoming calls",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "sessionId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Calls list" },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        tags: ["Calls"],
        summary: "Reject an incoming call",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  sessionId: { type: "string" },
                  callId: { type: "string" },
                },
                required: ["callId"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Call rejected" },
          "400": { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
  },
} as const;
