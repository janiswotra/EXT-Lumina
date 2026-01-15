# CORS Fix for Chrome Extension Support

## Problem
Chrome extension requests to API are blocked by CORS policy:
```
Access to fetch at 'https://lumina-api-kw353kceea-uc.a.run.app/...'
from origin 'chrome-extension://eolgnngkecmbeodppehflfiedmfidhjh'
has been blocked by CORS policy
```

---

## Solution

### Option 1: Allow All Chrome Extensions (Recommended for Development)

**Node.js/Express Example:**
```javascript
const cors = require('cors');

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow Chrome extensions
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // Allow your web app domains
    const allowedOrigins = [
      'https://app.yena.ai',
      'https://yena.ai',
      'http://localhost:3000',
      'http://localhost:5173'
    ];

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Reject other origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Option 2: Allow Specific Extension ID (Recommended for Production)

**Node.js/Express Example:**
```javascript
const ALLOWED_EXTENSION_ID = 'eolgnngkecmbeodppehflfiedmfidhjh'; // Your published extension ID

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // Allow specific Chrome extension
    if (origin === `chrome-extension://${ALLOWED_EXTENSION_ID}`) {
      return callback(null, true);
    }

    // Allow web app domains
    const allowedOrigins = [
      'https://app.yena.ai',
      'https://yena.ai',
      'http://localhost:3000'
    ];

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## Language-Specific Examples

### Python (Flask)
```python
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)

def is_chrome_extension(origin):
    return origin and origin.startswith('chrome-extension://')

CORS(app,
     origins=lambda origin, _: (
         is_chrome_extension(origin) or
         origin in ['https://app.yena.ai', 'https://yena.ai', 'http://localhost:3000']
     ),
     supports_credentials=True)
```

### Python (FastAPI)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow Chrome extensions
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^chrome-extension://[a-z]+$|^https://(app\.)?yena\.ai$|^http://localhost:\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Django
```python
# settings.py
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^chrome-extension://[a-z]+$",
    r"^https://(app\.)?yena\.ai$",
    r"^http://localhost:\d+$",
]

CORS_ALLOW_CREDENTIALS = True
```

### Java (Spring Boot)
```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns(
                    "chrome-extension://*",
                    "https://app.yena.ai",
                    "https://yena.ai",
                    "http://localhost:*"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
```

### Ruby (Rails)
```ruby
# config/initializers/cors.rb
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(/chrome-extension:\/\/.*/, 'https://app.yena.ai', 'https://yena.ai', /http:\/\/localhost:\d+/)

    resource '*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head],
      credentials: true
  end
end
```

### Go (Gin)
```go
import (
    "github.com/gin-contrib/cors"
    "github.com/gin-gonic/gin"
    "strings"
)

func main() {
    r := gin.Default()

    r.Use(cors.New(cors.Config{
        AllowOriginFunc: func(origin string) bool {
            // Allow Chrome extensions
            if strings.HasPrefix(origin, "chrome-extension://") {
                return true
            }
            // Allow web app domains
            allowedOrigins := []string{
                "https://app.yena.ai",
                "https://yena.ai",
                "http://localhost:3000",
            }
            for _, allowed := range allowedOrigins {
                if origin == allowed {
                    return true
                }
            }
            return false
        },
        AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
        AllowCredentials: true,
    }))

    r.Run()
}
```

---

## Google Cloud Run Specific Configuration

If your API is deployed on **Google Cloud Run**, you may need to configure CORS at the infrastructure level:

### Option A: Application Level (Recommended)
Use the code examples above in your application code.

### Option B: Cloud Load Balancer Level
If using a load balancer, configure CORS there:

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: lumina-api
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/cors: |
          {
            "allowOrigins": [
              "chrome-extension://*",
              "https://app.yena.ai",
              "https://yena.ai"
            ],
            "allowMethods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allowHeaders": ["Content-Type", "Authorization"],
            "allowCredentials": true
          }
```

---

## Critical: Handle OPTIONS Preflight Requests

Browsers send an OPTIONS request before the actual request. Your API MUST respond to these:

### Node.js/Express
```javascript
// This is usually handled by the cors() middleware automatically
// But if you have custom middleware, ensure OPTIONS are not blocked

app.options('*', cors()); // Enable pre-flight across all routes
```

### Manual OPTIONS Handler (if not using middleware)
```javascript
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.sendStatus(200);
  }
  next();
});
```

---

## Testing the Fix

### 1. Deploy the CORS fix to your API

### 2. Test with curl:
```bash
# Test OPTIONS (preflight)
curl -X OPTIONS https://lumina-api-kw353kceea-uc.a.run.app/api/v1/integrations/extension/me \
  -H "Origin: chrome-extension://eolgnngkecmbeodppehflfiedmfidhjh" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -v

# Should return:
# Access-Control-Allow-Origin: chrome-extension://eolgnngkecmbeodppehflfiedmfidhjh
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Allow-Credentials: true
```

### 3. Test with the Extension:
1. Reload your Chrome extension
2. Visit a LinkedIn profile
3. Check browser console (no CORS errors)
4. Extension should successfully fetch data

---

## Security Considerations

### ✅ Safe Approaches:
1. **Allow all Chrome extensions in development** - Easy for testing
2. **Allow specific extension ID in production** - More secure
3. **Validate API key in every request** - Extension sends API key, verify it server-side

### ⚠️ Important Notes:
- Chrome extension IDs are public (visible in Chrome Web Store URL)
- Don't rely on CORS alone for security
- Always validate API keys/tokens server-side
- Rate limit extension requests to prevent abuse

### Example Security Check:
```javascript
// Middleware to validate API key
app.use('/api/v1/integrations/extension/*', async (req, res, next) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
});
```

---

## Checklist

- [ ] Add CORS middleware to API
- [ ] Allow `chrome-extension://*` origin (or specific extension ID)
- [ ] Handle OPTIONS preflight requests
- [ ] Set `Access-Control-Allow-Credentials: true`
- [ ] Set allowed methods: GET, POST, PUT, DELETE, OPTIONS
- [ ] Set allowed headers: Content-Type, Authorization
- [ ] Deploy to staging/production
- [ ] Test with curl
- [ ] Test with Chrome extension
- [ ] Verify no CORS errors in console

---

## Affected Endpoints

These endpoints need CORS configured:

1. ✅ `POST /api/v1/integrations/extension/me` - Auth check
2. ✅ `GET /api/v1/integrations/linkedin/profiles/status` - Check if candidate exists
3. ✅ `POST /api/v1/integrations/linkedin/profiles` - Save candidate
4. ✅ `GET /api/v1/jobs` - Get jobs list
5. ✅ `GET /api/v1/stages` - Get stages list
6. ✅ `GET /api/v1/lists` - Get lists
7. ✅ `POST /api/v1/integrations/linkedin/profiles/batch-update` - Check for updates

**Apply CORS to all `/api/v1/integrations/extension/*` and `/api/v1/integrations/linkedin/*` routes.**

---

## Questions?

**Q: Is allowing all Chrome extensions secure?**
A: Yes, if you validate API keys. CORS is not a security feature - it only prevents browsers from making cross-origin requests. Your API key validation is the real security.

**Q: Can I restrict to my published extension only?**
A: Yes, use Option 2 above with your published extension ID. However, this won't work during development (unpacked extensions have different IDs).

**Q: What about Firefox/Edge extensions?**
A: Add support for `moz-extension://` (Firefox) and `extension://` (Edge) if needed.

**Q: Why is my Cloud Run deployment not working?**
A: Cloud Run sometimes caches old CORS configs. Try forcing a new deployment or clearing the cache.

---

## Priority: HIGH 🔴

This is blocking the extension from working. Please prioritize this fix.

**Estimated Time:** 15-30 minutes to implement and test
