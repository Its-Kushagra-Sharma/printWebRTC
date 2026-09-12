export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyPrint API Documentation & Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0b1120;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .top-navbar {
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #f8fafc;
    }
    .top-navbar .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: -0.02em;
    }
    .top-navbar .brand span {
      background: #38bdf8;
      color: #082f49;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .top-navbar .links {
      display: flex;
      gap: 16px;
      font-size: 0.9rem;
    }
    .top-navbar .links a {
      color: #94a3b8;
      text-decoration: none;
      transition: color 0.2s;
    }
    .top-navbar .links a:hover {
      color: #38bdf8;
    }
    #swagger-ui {
      max-width: 1200px;
      margin: 0 auto;
      padding: 10px 20px 40px;
    }
    /* Light card wrap for Swagger UI contrast */
    .swagger-container {
      background: #ffffff;
      border-radius: 12px;
      margin: 20px auto;
      max-width: 1200px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    /* Customize Swagger header colors slightly */
    .swagger-ui .topbar {
      display: none;
    }
    .swagger-ui .info {
      margin: 25px 0;
    }
    .swagger-ui .info .title {
      font-family: inherit;
      color: #0f172a;
    }
  </style>
</head>
<body>
  <div class="top-navbar">
    <div class="brand">
      MyPrint API
      <span>Swagger UI</span>
    </div>
    <div class="links">
      <a href="/api/openapi.json" target="_blank">Raw OpenAPI JSON</a>
      <a href="/merchant/create">Create Shop UI</a>
      <a href="/merchant">Merchant Console</a>
      <a href="/">Customer Page</a>
    </div>
  </div>

  <div class="swagger-container">
    <div id="swagger-ui"></div>
  </div>

  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        docExpansion: 'list',
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        persistAuthorization: true,
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
