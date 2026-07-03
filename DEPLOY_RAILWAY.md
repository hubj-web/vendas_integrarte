# Deploy no Railway — Guia Passo a Passo

Este guia explica como hospedar o **Sistema de Gestão de Pedidos e Entregas** gratuitamente no Railway.

---

## Pré-requisitos

- Conta no [Railway](https://railway.app) (gratuita — US$ 5/mês de crédito, suficiente para uso leve)
- Conta no [GitHub](https://github.com) (para hospedar o código)
- [Node.js 22+](https://nodejs.org) instalado no seu computador

---

## Passo 1 — Exportar o código para o GitHub

### 1.1 Baixar o código

No painel do Manus, clique em **⋯ (More) → Download as ZIP** e extraia o arquivo no seu computador.

### 1.2 Criar um repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. Crie um repositório **privado** com o nome `sistema-vendas`
3. **Não** inicialize com README

### 1.3 Enviar o código para o GitHub

Abra o terminal na pasta extraída e execute:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/sistema-vendas.git
git push -u origin main
```

> Substitua `SEU_USUARIO` pelo seu nome de usuário do GitHub.

---

## Passo 2 — Criar o projeto no Railway

1. Acesse [railway.app](https://railway.app) e faça login
2. Clique em **New Project**
3. Selecione **Deploy from GitHub repo**
4. Autorize o Railway a acessar seu GitHub e selecione o repositório `sistema-vendas`
5. O Railway detectará automaticamente o projeto Node.js

---

## Passo 3 — Adicionar o banco de dados MySQL

1. No projeto Railway, clique em **+ New** (canto superior direito)
2. Selecione **Database → Add MySQL**
3. Aguarde o banco ser criado (cerca de 30 segundos)
4. Clique no serviço MySQL → aba **Variables**
5. Copie o valor de `MYSQL_URL` (será usado no próximo passo)

---

## Passo 4 — Configurar as variáveis de ambiente

No serviço da aplicação (não no MySQL), clique em **Variables** e adicione:

| Variável | Valor | Descrição |
|---|---|---|
| `DATABASE_URL` | (cole o `MYSQL_URL` do passo anterior) | Conexão com o banco |
| `JWT_SECRET` | (gere uma string aleatória longa) | Segredo para tokens de sessão |
| `NODE_ENV` | `production` | Modo de produção |
| `OAUTH_SERVER_URL` | *(deixe vazio ou omita)* | Não usado no Railway |
| `VITE_APP_ID` | *(deixe vazio ou omita)* | Não usado no Railway |
| `VITE_OAUTH_PORTAL_URL` | *(deixe vazio ou omita)* | Não usado no Railway |
| `BUILT_IN_FORGE_API_URL` | *(deixe vazio ou omita)* | Não usado no Railway |
| `BUILT_IN_FORGE_API_KEY` | *(deixe vazio ou omita)* | Não usado no Railway |

> **Como gerar o JWT_SECRET:** Execute no terminal:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## Passo 5 — Criar as tabelas no banco de dados

Após o Railway fazer o primeiro deploy, você precisa criar as tabelas e popular os dados iniciais.

### 5.1 Instalar o Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 5.2 Conectar ao projeto

```bash
cd /pasta/do/projeto
railway link
# Selecione seu projeto e serviço
```

### 5.3 Executar o schema SQL

```bash
railway run node -e "
const mysql = require('mysql2/promise');
const fs = require('fs');
const sql = fs.readFileSync('scripts/schema.sql', 'utf-8');
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const statements = sql.split(';').filter(s => s.trim());
for (const stmt of statements) {
  try { await conn.execute(stmt); } catch(e) { /* ignore duplicate */ }
}
await conn.end();
console.log('Schema created!');
"
```

### 5.4 Popular os dados iniciais

```bash
railway run node scripts/seed-railway.mjs
```

Isso criará:
- Usuário admin (login: `admin` / senha: `1nt3gr@rt3sys`)
- Vendedores: Diego Carvalho, Aluísio João, Natália Luiza, Marli Pinhal, Vanusa Maria
- Categorias: Produtos Congelados, Minipizzas, Geleias
- Formas de entrega padrão
- Sabores de minipizza e geleia

---

## Passo 6 — Acessar o sistema

1. No Railway, clique no serviço da aplicação → aba **Settings**
2. Em **Networking → Public Networking**, clique em **Generate Domain**
3. Acesse a URL gerada (ex: `https://sistema-vendas-production.up.railway.app`)
4. Vá para `/admin` e faça login com `admin` / `1nt3gr@rt3sys`
5. **Troque a senha imediatamente** após o primeiro acesso

---

## Domínio personalizado (opcional)

Se você tiver um domínio próprio (ex: `sistema.minhaempresa.com.br`):

1. No Railway, vá em **Settings → Networking → Custom Domain**
2. Adicione seu domínio
3. Configure o DNS conforme as instruções do Railway

---

## Custos estimados

O plano gratuito do Railway oferece **US$ 5/mês em créditos**. Para este sistema:

| Serviço | Consumo estimado | Custo |
|---|---|---|
| Aplicação Node.js | ~0,5 vCPU / 256 MB RAM | ~US$ 2-3/mês |
| MySQL | ~100 MB de dados | ~US$ 1-2/mês |
| **Total** | | **~US$ 3-5/mês** |

> Para uso interno com poucos usuários simultâneos, o crédito gratuito deve ser suficiente ou muito próximo disso.

---

## Solução de problemas

### O deploy falha com erro de build

Verifique se o `pnpm-lock.yaml` está no repositório (não deve estar no `.gitignore`).

### Erro "Cannot connect to database"

Confirme que o `DATABASE_URL` está correto e que o MySQL está rodando no Railway.

### Tela em branco após login

Verifique se o `JWT_SECRET` está configurado nas variáveis de ambiente.

### Erro 500 no login

O `OAUTH_SERVER_URL` pode estar causando erro de inicialização. Deixe-o vazio ou configure como `http://localhost` para desabilitar o OAuth externo.
