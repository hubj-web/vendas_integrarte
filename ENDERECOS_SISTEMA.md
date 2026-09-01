# Endereços do Sistema Integrarte — para atualização dos links no site institucional

Este documento lista todos os endereços atuais do sistema (hospedado no Railway), pra atualização dos botões/links no site institucional (www.integrarte.ong.br, hospedado no Vercel).

**Importante**: o sistema tem 4 partes (CRM, Loja, App Vendedor, App Entregador), mas todas rodam dentro do **mesmo aplicativo** — o que muda é só o caminho depois do domínio.

---

## 🟢 PRODUÇÃO — usar estes links no site institucional

| Ferramenta | Link |
|---|---|
| **CRM** (painel administrativo) | `https://crm.integrarte.ong.br` |
| **Loja Pública** | `https://loja.integrarte.ong.br` |
| **App do Vendedor** | `https://crm.integrarte.ong.br/vendedor` |
| **App do Entregador** | `https://crm.integrarte.ong.br/entregador` |

Esses são os únicos endereços que devem aparecer nos botões do site institucional — são os que os clientes, vendedores e entregadores de verdade devem usar no dia a dia.

---

## 🟡 DEV (ambiente de testes) — não usar no site institucional

Uso interno só da equipe, pra testar mudanças antes de irem pra produção. **Nunca deve ser divulgado publicamente nem linkado no site institucional.**

| Ferramenta | Link |
|---|---|
| **CRM** (painel administrativo) | `https://crmintegrarte-ambiente-de-dev.up.railway.app` |
| **Loja Pública** | `https://crmintegrarte-ambiente-de-dev.up.railway.app/loja` |
| **App do Vendedor** | `https://crmintegrarte-ambiente-de-dev.up.railway.app/vendedor` |
| **App do Entregador** | `https://crmintegrarte-ambiente-de-dev.up.railway.app/entregador` |

---

## ⚪ Endereço legado (não usar em novos links)

`https://www.integrarte.app.br` — domínio antigo, ainda funciona por baixo dos panos (aponta pro mesmo sistema), mas não está mais sendo mantido ativamente como link oficial desde que migramos pra `.ong.br`. Não incluir em nenhum botão novo.

---

## Sobre o site institucional em si

`www.integrarte.ong.br` é um sistema **totalmente separado**, hospedado no Vercel — não faz parte do Railway. Nenhuma configuração do lado do Railway precisa mudar pra essa atualização; a mudança é só nos links/botões dentro do código do site institucional (feita pelo Manus, com deploy no Vercel).
