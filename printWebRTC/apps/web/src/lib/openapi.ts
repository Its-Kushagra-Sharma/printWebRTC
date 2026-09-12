export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "MyPrint Cloud-to-Edge Print API",
    version: "1.0.0",
    description: `
API specification for **MyPrint** — a private cloud-to-edge printing service.
Documents stream directly from customer browsers to merchant desktop agents via WebRTC data channels.
Use this interactive Swagger UI to test and inspect the API endpoints.

### Authentication
Endpoints marked with the lock icon require a **Bearer Token** (Firebase ID Token or Custom Token).
Click the **Authorize** button on the right to supply your token.
    `.trim(),
  },
  servers: [
    {
      url: "/",
      description: "Current Environment",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Supply your Firebase ID token (or Custom Token) as a Bearer token.",
      },
    },
    schemas: {
      Pricing: {
        type: "object",
        properties: {
          mono_paisa: {
            type: "integer",
            description:
              "Price per monochrome / black-and-white page in paisa (1 INR = 100 paisa)",
            example: 200,
          },
          color_paisa: {
            type: "integer",
            description: "Price per color page in paisa",
            example: 1200,
          },
          duplex_discount_paisa: {
            type: "integer",
            description: "Discount per duplex page in paisa",
            example: 25,
          },
          minimum_order_paisa: {
            type: "integer",
            description: "Minimum order amount in paisa",
            example: 1000,
          },
        },
      },
      PrintOptions: {
        type: "object",
        required: ["copies", "color", "duplex", "paper"],
        properties: {
          copies: {
            type: "integer",
            minimum: 1,
            example: 1,
          },
          color: {
            type: "boolean",
            example: false,
          },
          duplex: {
            type: "boolean",
            example: false,
          },
          paper: {
            type: "string",
            enum: ["A4", "A3", "Letter"],
            example: "A4",
          },
          printer_id: {
            type: "string",
            description: "Target printer device name",
            example: "HP-LaserJet-Pro-M404",
          },
        },
      },
      CreateShopRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            minLength: 2,
            maxLength: 100,
            description: "Commercial name of the print shop",
            example: "Apex Photocopy & Cyber Cafe",
          },
          currency: {
            type: "string",
            minLength: 3,
            maxLength: 3,
            default: "INR",
            description: "3-letter ISO currency code",
            example: "INR",
          },
          shop_id: {
            type: "string",
            description:
              "Optional custom slug/ID. If omitted, a unique sh_* ID is generated.",
            example: "apex-prints",
          },
          agent_id: {
            type: "string",
            default: "agent-001",
            description: "Initial agent identifier for the desktop receiver",
            example: "agent-001",
          },
          pricing: {
            $ref: "#/components/schemas/Pricing",
          },
        },
      },
      CreateShopResponse: {
        type: "object",
        properties: {
          shop_id: {
            type: "string",
            example: "sh_a1b2c3d4e5f6",
          },
          name: {
            type: "string",
            example: "Apex Photocopy & Cyber Cafe",
          },
          currency: {
            type: "string",
            example: "INR",
          },
          qr_path: {
            type: "string",
            example: "/p/sh_a1b2c3d4e5f6",
          },
          auth_token: {
            type: "string",
            description:
              "Signed Firebase custom token for merchant authentication",
          },
          agent_id: {
            type: "string",
            example: "agent-001",
          },
          agent_token: {
            type: "string",
            description:
              "Signed Firebase custom token for desktop agent provisioning",
          },
          pricing: {
            $ref: "#/components/schemas/Pricing",
          },
        },
      },
      CreateJobRequest: {
        type: "object",
        required: [
          "shopId",
          "agentId",
          "pages",
          "options",
          "paymentMethod",
          "fileName",
          "mimeType",
          "byteLength",
          "sha256",
        ],
        properties: {
          shopId: {
            type: "string",
            example: "sh_a1b2c3d4e5f6",
          },
          agentId: {
            type: "string",
            example: "agent-001",
          },
          pages: {
            type: "integer",
            minimum: 1,
            example: 5,
          },
          options: {
            $ref: "#/components/schemas/PrintOptions",
          },
          paymentMethod: {
            type: "string",
            enum: ["wallet", "cash"],
            example: "cash",
          },
          fileName: {
            type: "string",
            example: "document.pdf",
          },
          mimeType: {
            type: "string",
            example: "application/pdf",
          },
          byteLength: {
            type: "integer",
            minimum: 1,
            example: 1048576,
          },
          sha256: {
            type: "string",
            pattern: "^[a-f0-9]{64}$",
            description:
              "64-character lowercase hexadecimal SHA-256 hash of the document bytes",
            example:
              "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "string",
            example: "Operation failed",
          },
        },
      },
    },
  },
  paths: {
    "/api/shops": {
      post: {
        summary: "Create and provision a print shop",
        description:
          "Creates a new shop, defines base per-page pricing, initializes the desktop agent, and mints merchant and agent custom tokens.",
        security: [{ bearerAuth: [] }],
        tags: ["Shops"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateShopRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Shop created successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateShopResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid input or validation failed",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized (missing or invalid Bearer token)",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      get: {
        summary: "Get current merchant shop details",
        description:
          "Retrieves the authenticated merchant shop profile, pricing rules, and connected desktop agents.",
        security: [{ bearerAuth: [] }],
        tags: ["Shops"],
        responses: {
          "200": {
            description: "Shop profile retrieved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    shop: { type: "object" },
                    pricing: { $ref: "#/components/schemas/Pricing" },
                    agents: {
                      type: "array",
                      items: { type: "object" },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Shop not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/public/shops/{shopId}": {
      get: {
        summary: "Get public shop details and printer status",
        description:
          "Public unauthenticated endpoint used by the customer QR print page. Deliberately returns only QR-safe fields.",
        tags: ["Public"],
        parameters: [
          {
            name: "shopId",
            in: "path",
            required: true,
            description: "Unique shop identifier",
            schema: {
              type: "string",
              example: "sh_a1b2c3d4e5f6",
            },
          },
        ],
        responses: {
          "200": {
            description: "Public shop metadata and online printers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    shop: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                      },
                    },
                    pricing: {
                      $ref: "#/components/schemas/Pricing",
                    },
                    agent: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        printers: {
                          type: "array",
                          items: { type: "string" },
                          example: ["HP LaserJet Pro", "Epson L3150"],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": {
            description: "Print shop unavailable or inactive",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "503": {
            description: "Shop printer agent is currently offline",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/jobs": {
      post: {
        summary: "Create print job with atomic price calculation",
        description:
          "Locks in pricing on the server and prepares the WebRTC signaling doc. For cash jobs, sets status to awaiting_cash_approval; for wallet jobs, debits wallet and sets status to ready_for_transfer.",
        security: [{ bearerAuth: [] }],
        tags: ["Jobs"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateJobRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Job created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "job_xyz123" },
                    fee_paisa: { type: "integer", example: 200 },
                    status: {
                      type: "string",
                      enum: ["ready_for_transfer", "awaiting_cash_approval"],
                      example: "ready_for_transfer",
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid job request or insufficient funds",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/shops/{shopId}/jobs/{jobId}/approve-cash": {
      post: {
        summary: "Approve a cash-on-counter print job",
        description:
          "Executed by authenticated merchant to confirm cash payment, transitioning job status to ready_for_transfer.",
        security: [{ bearerAuth: [] }],
        tags: ["Shops"],
        parameters: [
          {
            name: "shopId",
            in: "path",
            required: true,
            schema: { type: "string", example: "sh_a1b2c3d4e5f6" },
          },
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string", example: "job_xyz123" },
          },
        ],
        responses: {
          "200": {
            description: "Cash approved and job unlocked for WebRTC streaming",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
          "403": {
            description: "Not authorized or job cannot be approved",
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
};
