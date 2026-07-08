# Como configurar a integração com o Google Sheets (Google Drive)

Para ativar a funcionalidade de salvar os relatórios de pedidos, clientes e backups diretamente no Google Sheets, você precisa criar uma "Conta de Serviço" (Service Account) no Google Cloud Platform e configurar algumas variáveis de ambiente no seu projeto.

## 1. Criar Projeto no Google Cloud Console

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. No topo da página, clique no dropdown de projetos (ou em "Meus Projetos") e clique em **"NOVO PROJETO"**.
3. Dê um nome ao projeto (ex: `integrarte-sheets`) e clique em **"CRIAR"**.

## 2. Ativar a API do Google Sheets

1. Na barra lateral esquerda, clique em **"APIs e Serviços"** e depois em **"Biblioteca"**.
2. Pesquise por `Google Sheets API` e clique nela.
3. Clique no botão azul **"ATIVAR"**.

## 3. Criar uma Conta de Serviço

1. Na barra lateral esquerda, clique em **"APIs e Serviços"** e depois em **"Credenciais"**.
2. Clique no botão **"CRIAR CREDENCIAIS"** (no topo) e selecione **"Conta de serviço"**.
3. Preencha o "Nome da conta de serviço" (ex: `integrarte-service`) e clique em **"CRIAR E CONTINUAR"**.
4. Na etapa "Opcional - conceder acesso", você pode pular clicando em **"CONCLUIR"**.

## 4. Gerar a Chave da Conta de Serviço

1. Na lista de contas de serviço, clique no nome da conta que você acabou de criar (`integrarte-service`).
2. Vá até a aba **"CHAVES"**.
3. Clique em **"ADICIONAR CHAVE"** > **"Criar nova chave"**.
4. Certifique-se de que **"JSON"** está selecionado e clique em **"CRIAR"**.
5. O navegador baixará um arquivo `.json` contendo as credenciais da sua conta de serviço.

## 5. Extrair as Informações do Arquivo JSON

Abra o arquivo `.json` que você baixou em um editor de texto. Ele será parecido com isso:

```json
{
  "type": "service_account",
  "project_id": "integrarte-sheets",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANB...\n-----END PRIVATE KEY-----\n",
  "client_email": "integrarte-service@integrarte-sheets.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

Você precisará de dois valores deste arquivo:
1. **`client_email`**: O endereço de e-mail da conta de serviço.
2. **`private_key`**: A chave privada (incluindo os traços `-----BEGIN PRIVATE KEY-----`).

## 6. Criar uma Planilha no Google Drive

1. Acesse o [Google Sheets](https://sheets.google.com/) ou o seu Google Drive.
2. Crie uma nova planilha em branco.
3. Copie o **ID da planilha** que está na URL. 
   - Exemplo: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit`
   - O ID é a parte longa entre `/d/` e `/edit`: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`

## 7. Dar Acesso à Conta de Serviço

1. Abra a planilha que você acabou de criar.
2. Clique no botão verde **"Compartilhar"** no canto superior direito.
3. Cole o `client_email` da sua conta de serviço (aquele que termina em `@...iam.gserviceaccount.com`).
4. Selecione a permissão **"Editor"**.
5. Clique em **"Enviar"** ou **"Concluir"**.

## 8. Configurar as Variáveis de Ambiente

Agora você precisa adicionar as credenciais às variáveis de ambiente do seu projeto. Adicione as seguintes variáveis:

| Variável | Valor |
|----------|-------|
| `GOOGLE_SHEETS_CLIENT_EMAIL` | O valor de `client_email` do arquivo JSON |
| `GOOGLE_SHEETS_PRIVATE_KEY` | O valor de `private_key` do arquivo JSON (incluindo as quebras de linha `\n`) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | O ID da planilha que você copiou da URL |

Se você estiver usando o `.env` localmente, adicione assim:
```env
GOOGLE_SHEETS_CLIENT_EMAIL=seu-email@seu-projeto.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANB...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

Pronto! Agora o sistema de vendas da Integrarte poderá salvar os relatórios de pedidos, clientes e backups diretamente nesta planilha do Google Sheets. Ao clicar nos botões "Salvar no Google Sheets", os dados serão escritos em uma nova aba dentro da planilha.
