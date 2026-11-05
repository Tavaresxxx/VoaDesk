# VoaDesk 0.2 — cliente, identidade e pareamento

## Escopo entregue

Cliente Windows nativo em um único `.exe`, janela pequena sem navegador ou dependências Node, logo original incorporada e código temporário. Principal reformulado em preto/branco/azul, logo original, entrada do código e fluxo real de verificação. Ícone V em ICO com sete resoluções, favicon, recursos PE e identificação de janela/AppUserModelID da instância Edge criada pelo aplicativo. A logo original não foi redesenhada.

O cadastro do cliente e a verificação do código usam um serviço Node separado do host desktop. Nenhuma mídia passa nele. A verificação identifica que o cliente está presente com o token correspondente; **não equivale a uma sessão remota autorizada ou a identidade individual do técnico**. Não há captura/injeção de entrada no cliente compacto nesta entrega.

## Protocolo

- `POST /v1/clients`: emite código CSPRNG de 12 símbolos (60 bits), cinco minutos, token de cliente CSPRNG de 256 bits e TTL. Código/token retornam somente ao cliente; no serviço são indexados por SHA-256, sem log.
- `GET /v1/clients/status`, Bearer do cliente: waiting / verified / expired.
- `POST /v1/clients/revoke`, Bearer do cliente: invalida o código e token. Fechar o cliente tenta revogar com espera limitada; expiração cobre rede indisponível.
- `POST /v1/codes/verify`, Bearer do operador: consome atomicamente o código. A resposta não traz conteúdo de tela, token do cliente ou dados pessoais.
- `GET /health`: readiness e versão, sem segredos.

Limites em uma instância: 12 registros/IP/minuto; 8 verificações/IP/minuto após autenticação do operador; 180 mutações/IP/minuto; 240 polls/IP/minuto; 1.000 clientes ativos; 10.000 buckets de rate limit, limpeza periódica e corpo máximo 2 KiB. Cliente consulta a cada cinco segundos. O token de operador não vai para o renderer: o host desktop autentica o cookie/origem e faz o proxy da verificação. A API pública rejeita chamadas com Origin de navegador; não habilita CORS. HTTPS externo é obrigatório no cliente. Cabeçalhos de IP encaminhado só são confiáveis quando a implantação está atrás de um proxy administrado.

Sem persistência: códigos desaparecem em redeploy/restart. Isso evita reutilização entre processos e exige solicitar novos códigos. Uma única instância é necessária; múltiplas instâncias exigirão armazenamento/transações/rate limiting compartilhados antes de serem ativadas.

## Render

Destino solicitado: projeto `prj-dbmcggegekts73chkcv0`, Matheus's workspace (`tea-dbcelj0m7kps73fgjmv0`), repositório privado Tavaresxxx/VoaDesk. O plugin conseguiu consultar o workspace, mas as tentativas de criação inicialmente falharam com HTTP 400: repositório inválido ou não acessível ao Render. O usuário confirmou que o repositório não aparecia na lista de New Web Service; foi indicado liberar o aplicativo **Render** no GitHub. Isso é uma conexão diferente do plugin GitHub do assistente.

Só considerar publicado após obter service ID, deploy `live`, HTTPS `/health` e executar emissão/verificação/replay/revogação no endpoint real sem registrar códigos/tokens. Criação aceita pelo plugin não é publicação concluída. Registrar o resultado final em `artifacts/render-deployment.json`; não presumir um endereço pelo nome. O plugin não oferece associação de projeto na criação simplificada; se a criação for feita pelo painel dentro do projeto, a associação fica explícita.

Comando inicial: `node src/pairing/service.mjs`; build: `node --test tests/pairing.test.mjs`; plano Free; Node 24; região Virginia. Porta de `PORT`, bind `0.0.0.0`, health `/health`. Credencial do operador via env do Render, sem arquivo secreto no Git. O operador local usa arquivo com ACL exclusiva do usuário/SYSTEM; DPAPI é preferido quando disponível. Neste ambiente restrito, DPAPI falhou porque o perfil de usuário não estava carregado; o teste comprovou criação com ACL. Não chamar esse fallback de armazenamento DPAPI.

Free serve para laboratório: suspensão após 15 min inativo, cold start, cotas e invalidação dos códigos em restart. Não é hospedagem homologada comercialmente. A primeira conexão do cliente mostra indisponibilidade e permite tentar novamente enquanto o serviço inicia. Não transmitir vídeo por esse serviço. TURN, OIDC pessoal e sessões autenticadas de mídia permanecem futuros.

## Evidências locais executadas

- Build C# x64 passou: launcher, cliente autônomo, helper de ícone e probe de cor.
- Nove testes Node passaram, incluindo códigos válidos/expirados, token vinculado, consumo, replay, revogação e rate limit.
- `artifacts/voadesk/client-smoke.json`: cliente nativo exibiu código emitido pelo serviço, serviço reconheceu o código, recursos de logo/ícone presentes, janela compacta. Painel reconheceu outro código e rejeitou replay sem abrir captura. Layout testado em 1440 px e 760 px sem overflow horizontal, sem pageerror.
- `artifacts/voadesk/client-redacted.png`: janela nativa renderizada; o código foi substituído só na imagem de evidência. `principal-desktop.png` e `principal-compact.png`: revisão visual do tema.
- `artifacts/voadesk-video/video-smoke.json`: regressão H.264 aprovada nos três perfis, escala 1:1, tela cheia, encerramento, reinício e perda do host local. Não substitui os testes de duas máquinas ou 30 minutos descritos no relatório inicial.
- `artifacts/voadesk/window-smoke.json`: tentativa de verificar as propriedades da janela principal ficou **não confirmada**: Edge iniciado pelo executor encerrou com código `2147483651`. O cliente WinForms foi testado; o ícone físico da barra de tarefas da janela principal exige conferência em execução normal do usuário. Recursos ICO/PE, favicon e helper de AppUserModelID foram compilados; não afirmar inspeção visual da barra sem realizá-la.
- Os ensaios Playwright acima usaram o padrão de teste `chromiumSandbox=false` da biblioteca. Eles comprovam fluxos/renderização no ambiente de teste, não validação do sandbox de distribuição. O launcher entregue **não** adiciona `--no-sandbox`; nenhuma proteção do Edge pessoal foi alterada. A tentativa adicional com sandbox está registrada em `sandbox-probe.json`. Fonte do comportamento padrão: https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox.

Fontes oficiais: https://render.com/docs/git-provider, https://render.com/docs/free, https://render.com/docs/health-checks, https://learn.microsoft.com/en-us/windows/win32/shell/appids e propriedades `System.AppUserModel.RelaunchCommand`, `RelaunchIconResource`, `RelaunchDisplayNameResource`.
