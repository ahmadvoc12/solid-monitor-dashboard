# Dike-Chat

Get started with **Dike-Chat** — a personal AI chat app that lets you **seamlessly switch between multiple LLMs** while keeping your data **decentralized and user-owned via Solid Pods** — built on top of the innovative **Horizon AI Template** for Next.js & React.

---

## ✨ Key Features

- **Switchable LLMs**: Change the underlying model (e.g., OpenAI, etc.) within the same session without page reload.
- **Decentralized Storage (Solid)**: Store chat sessions in your **Solid Pod**; you own your data.
- **Modern UI**: Powered by the **Horizon AI Free Template** for a sleek, responsive interface.
- **TypeScript + Next.js 13+**: App Router ready, client-side auth with `@inrupt/solid-client-authn-browser`.

---



### Documentation

this element using template horizon ai free template. You can read more about the <a href="https://horizon-ui.com/docs-ai-template/docs/introduction?ref=readme-horizon-ai-template-free" target="_blank">documentation here.</a>

### Quick Start

Install Dike-chat running either of the following:

- Install NodeJS LTS from [NodeJs Official Page]

Clone the repository with the following command:

```bash
git clone https://github.com/ahmadvoc12/project-personal-agent-repo
```

Run in the terminal this command:

```bash
npm install
```

Then run this command to start your local server

```bash
npm run build
```

To running in your local server using

```bash
npm start
```

to create local environment you can modified your own server
# --- App base URL (for Next.js, e.g. http://localhost:3000) ---
NEXT_PUBLIC_APP_URL=

# --- Solid OIDC Issuer (your provider) ---
NEXT_PUBLIC_SOLID_OIDC_ISSUER=

# Optional: default login issuer shown in UI
NEXT_PUBLIC_DEFAULT_IDP=

# --- LLM keys (example: OpenAI) ---
OPENAI_API_KEY=

# (If you support multiple LLMs, add their keys here as well)


