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
  },
} as const;
