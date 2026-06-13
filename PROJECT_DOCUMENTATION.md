# REM-X-CALL — Complete Project Documentation

---

## 1. Project Overview

**Rem-X-Call** ek full-stack web application hai jo call centers aur companies ko apne agents manage karne, calls track karne, messages bhejne aur subscriptions handle karne ki suvidha deta hai.

**Type:** VoIP / Call Center Management System  
**Stack:** React.js (Frontend) + Node.js/Express (Backend) + MySQL (Database)

---

## 2. Technology Stack

### Frontend (client/)
| Technology | Version | Use |
|------------|---------|-----|
| React.js | 19.x | UI Framework |
| Vite | 7.x | Build Tool |
| Tailwind CSS | 4.x | Styling |
| React Router | 7.x | Page Routing |
| Axios | 1.x | API Calls |
| Socket.IO Client | 4.x | Real-time Chat |
| Recharts | 3.x | Charts/Graphs |
| Lucide React | 0.x | Icons |

### Backend (server/)
| Technology | Version | Use |
|------------|---------|-----|
| Node.js | 25.x | Runtime |
| Express.js | 5.x | Web Framework |
| Sequelize | 6.x | ORM (Database) |
| MySQL2 | 3.x | Database Driver |
| JWT | 9.x | Authentication |
| bcryptjs | 3.x | Password Hashing |
| Socket.IO | 4.x | Real-time |
| Nodemailer | 8.x | Email Service |
| Firebase Admin | 13.x | Push Notifications |
| Multer | 2.x | File Upload |
| Winston | 3.x | Logging |
| Helmet | 8.x | Security Headers |

---

## 3. Project Structure

```
rem-x-call/
├── client/                    # Frontend (React)
│   └── src/
│       ├── pages/             # All pages/screens
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Contacts.jsx
│       │   ├── Messages.jsx
│       │   ├── Reports.jsx
│       │   ├── Subscriptions.jsx
│       │   ├── CompanyManagement.jsx
│       │   ├── Settings.jsx
│       │   └── agent/         # Agent-specific pages
│       ├── components/        # Reusable components
│       ├── context/           # Auth context
│       ├── hooks/             # Custom hooks
│       └── lib/               # API, socket, utils
│
├── server/                    # Backend (Node.js)
│   └── src/
│       ├── controllers/       # Request handlers
│       ├── routes/            # API endpoints
│       ├── models/            # Database models
│       ├── services/          # Business logic
│       ├── middleware/        # Auth, upload, error
│       ├── realtime/          # Socket.IO
│       └── utils/             # Helper functions
│
├── server/migrations/         # Database table migrations
└── deploy/                    # Nginx + PM2 config
```

---

## 4. User Roles

| Role | Access |
|------|--------|
| **Admin** | Full access — companies, agents, subscriptions, all data |
| **Agent (user)** | Limited — apna dashboard, contacts, products, billing |

---

## 5. Authentication Flow

### Admin ka pehla login (First Time Setup)
```
POST /v1/auth/bootstrap-first-admin
Body: { username, email, password, setupSecret }
```
- Sirf tab kaam karta hai jab database mein zero users hon
- `SETUP_SECRET` `.env` se match karna chahiye
- **One-time only** — dobara nahi chalta

### Normal Login
```
POST /v1/auth/login
Body: { email, password }
Response: { user, tokens: { access, refresh } }
```

### Agent Onboarding Flow
```
1. Admin → Company create karta hai
2. System → Agent ko invite email bhejta hai (temporary password)
3. Agent → Email se login karta hai
4. Agent → Password change karta hai
5. Agent → Dashboard access milta hai
```

### Password Reset Flow
```
1. POST /v1/auth/forgot-password   → OTP email pe
2. POST /v1/auth/verify-reset-otp  → OTP verify
3. POST /v1/auth/reset-password    → Naya password set
```

---

## 6. API Endpoints

### Auth — `/v1/auth`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/bootstrap-first-admin` | Pehla admin banana |
| POST | `/login` | Login |
| POST | `/logout` | Logout |
| POST | `/logout-all` | Sab sessions logout |
| GET | `/me` | Apni profile |
| PATCH | `/me` | Profile update |
| POST | `/me/avatar` | Avatar upload |
| POST | `/refresh-tokens` | Token refresh |
| POST | `/forgot-password` | OTP bhejna |
| POST | `/verify-reset-otp` | OTP verify |
| POST | `/reset-password` | Password reset |
| GET | `/sessions` | Active sessions list |
| DELETE | `/sessions/:sid` | Session revoke |

### Companies — `/v1/companies` (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Saari companies list |
| POST | `/` | Nai company banana |
| GET | `/:id` | Company detail |
| PATCH | `/:id` | Company update |
| DELETE | `/:id` | Company delete |
| POST | `/bulk-delete` | Multiple delete |
| POST | `/:id/resend-invite` | Invite dobara bhejna |
| POST | `/:id/cancel-invite` | Invite cancel |
| GET | `/my-branding` | Apni company branding |
| PATCH | `/my-branding` | Branding update |

### Subscription Plans — `/v1/subscription-plans` (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Saare plans |
| POST | `/` | Naya plan banana |
| PATCH | `/:id` | Plan update |
| DELETE | `/:id` | Plan delete |

### Contacts — `/v1/contacts`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Contacts list |
| POST | `/` | Contact banana |
| GET | `/:id` | Contact detail |
| PATCH | `/:id` | Contact update |
| DELETE | `/:id` | Contact delete |

### Calls — `/v1/calls`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/initiate` | Call shuru karna |

### Dashboard — `/v1/dashboard`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Overview stats |
| GET | `/recent-calls` | Recent calls |
| GET | `/agent-performance` | Agent performance |

### Messages — `/v1/messages`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Messages list |
| POST | `/` | Message bhejna |

### Notifications — `/v1/notifications`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Notifications list |
| PATCH | `/:id/read` | Read mark karna |

### Products — `/v1/products`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Products list |
| POST | `/` | Product banana |
| PATCH | `/:id` | Product update |
| DELETE | `/:id` | Product delete |

---

## 7. Database Models

| Model | Table | Description |
|-------|-------|-------------|
| User | Users | Admins aur agents |
| Company | Companies | Client companies |
| SubscriptionPlan | SubscriptionPlans | Plans (Basic, Pro) |
| Contact | Contacts | Call contacts |
| CallLog | CallLogs | Call history |
| Message | Messages | Chat messages |
| Notification | Notifications | System alerts |
| Product | Products | Agent products |
| SubscriptionHistory | SubscriptionHistories | Billing history |
| UserSession | UserSessions | Active sessions |
| RevokedToken | RevokedTokens | Logged out tokens |
| PasswordResetOtp | PasswordResetOtps | Reset OTPs |
| FcmToken | FcmTokens | Firebase push tokens |

---

## 8. Real-time Features (Socket.IO)

- **Online/Offline status** — agents ka live status
- **Live chat** — admin aur agent ke beech messaging
- **Events:**
  - `users:online-list` — online users ki list
  - `users:online-status` — koi online/offline hua
  - `users:request-online` — online list maango

---

## 9. Environment Variables

### server/.env
```env
PORT=5000
NODE_ENV=development

# Database
DB_HOST=127.0.0.1
DB_USER=root
DB_PASS=
DB_NAME=rem_x_call_local
DB_PORT=3306

# Security
SETUP_SECRET=strong-random-string   # Pehla admin banane ke liye
JWT_SECRET=strong-random-string     # Token signing ke liye
JWT_EXPIRES_IN=1d

# Email
SMTP_HOST=smtp.remxcall.co.za
SMTP_PORT=465
SMTP_USER=info@remxcall.co.za
SMTP_PASS=your-password

# CORS
CORS_ORIGINS=http://localhost:5173

# AWS (File uploads)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=
```

### client/.env
```env
VITE_API_URL=http://localhost:5000
```

---

## 10. Local Development Setup

```bash
# 1. Dependencies install
cd server && npm install
cd client && npm install

# 2. .env files set karo (upar dekho)

# 3. XAMPP mein MySQL start karo

# 4. Database banana
# phpMyAdmin: http://localhost/phpmyadmin
# New database: rem_x_call_local

# 5. Tables migrate karo
cd server && npm run migrate

# 6. Pehla admin banana
POST http://localhost:5000/v1/auth/bootstrap-first-admin
{ "username":"admin", "email":"admin@example.com", 
  "password":"Admin@1234", "setupSecret":"your-secret" }

# 7. Servers start karo
cd server && npm run dev    # Backend: port 5000
cd client && npm run dev    # Frontend: port 5173
```

---

## 11. Demo Data (Development only)

```bash
cd server && npm run seed:demo-data
```

Yeh inject karta hai:
- Company: **FlutterCraft LLC**
- Admin: `admin@fluttercraft.com` / `Password123!`
- Agent: `agent@fluttercraft.com` / `Password123!`
- 7 Contacts, 8 Call logs, 10 Products, 5 Messages, 4 Notifications, 2 Plans

---

## 12. Known Issues & Improvements Needed

### ❌ Static Data (Fix Karna Chahiye)
**Reports.jsx** mein hardcoded fake data hai:
- Call statistics numbers (`1,000`, `42,310`) — API se aane chahiye
- Bar chart data (`mockBarData`) — real call logs se
- Revenue line chart (`mockLineData`) — real revenue data se
- Revenue amounts (`$5000`, `$2000`) — real data se

### ❌ Incomplete Features
- **Weekly/Monthly/Daily dropdown** — Dashboard aur Reports mein filter kaam nahi karta (UI hai lekin API call nahi hoti)
- **Calls chart** — Dashboard mein bar chart hamesha empty dikhta hai (data bind nahi)
- **Call initiate** — `/v1/calls/initiate` endpoint hai lekin VICIDIAL/Twilio credentials chahiye
- **Firebase Push Notifications** — credentials file missing hai

### ⚠️ Security Issues
- `SETUP_SECRET=change-me-long-random-string` — production pe strong value chahiye
- `JWT_SECRET=your_super_secret_key_here` — production pe strong value chahiye

### ✅ Jo Theek Hai
- Authentication complete hai (login, logout, sessions, OTP reset)
- Company management complete hai
- Subscription plans CRUD complete hai
- Contacts CRUD complete hai
- Real-time chat working hai
- Notifications system working hai
- Products management complete hai
- Agent dashboard working hai

---

## 13. Production Deployment

Server pe yeh files hain already (`deploy/staging/`):
- `nginx-remxcall.conf` — Nginx reverse proxy config
- `ecosystem.config.cjs` — PM2 process manager config

### Production ke liye checklist:
- [ ] Strong `SETUP_SECRET` set karo
- [ ] Strong `JWT_SECRET` set karo
- [ ] `SMTP_PASS` set karo (email ke liye)
- [ ] AWS credentials set karo (file upload ke liye)
- [ ] Firebase credentials set karo (push notifications ke liye)
- [ ] `NODE_ENV=production` set karo
- [ ] MySQL production database banao
- [ ] `npm run migrate` run karo
- [ ] Bootstrap admin banao (one-time)
- [ ] `npm run build` (client) run karo
- [ ] PM2 se server start karo

---

*Document created: June 2026*
