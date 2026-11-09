# VoaDesk 0.7 — suporte remoto para Windows

O VoaDesk tem dois aplicativos: **Técnico**, para solicitar e conduzir atendimentos, e **Cliente**, para mostrar o código, receber a solicitação, autorizar e encerrar o acesso. O código identifica o dispositivo; cada atendimento depende de consentimento explícito.

O técnico agora usa uma janela Windows própria em **WinForms + Microsoft WebView2**. A interface existente, o vídeo e os controles ficam dentro dela. Não é um atalho para o Edge. O Node.js portátil acompanha a distribuição e inicia como processo auxiliar sem console, exclusivamente em loopback.

## Abrir a versão distribuída

Os arquivos gerados ficam em `instalação/`:

- **VoaDeskTecnico.zip**: extraia a pasta completa e abra **VoaDeskTecnico.exe** pelo ícone. `AbrirTecnico.bat` continua disponível como alternativa.
- **VoaDeskCliente.exe**: entregue ao computador atendido. É portátil e não exige Node.js instalado.

Mantenha o EXE do técnico junto das DLLs, `src/`, `dist/` e `runtime/`. O pacote não contém credencial de operador: reutiliza a configuração privada existente nesta conta Windows. Outra conta ou computador de técnico precisa de provisionamento autorizado. O aplicativo explica a ausência da configuração, sem gerar credenciais novas.

Pré-requisitos: Windows 11 x64, .NET Framework 4.8 e **Microsoft Edge WebView2 Runtime Evergreen** no técnico. A janela detecta a ausência do runtime e oferece o link oficial; Edge instalado não substitui esse runtime. O cliente continua usando Edge e .NET Framework 4.8. Os monitores compartilhados precisam operar em SDR. Não é necessário instalar ferramentas de desenvolvimento.

O pacote distribuído usa a configuração existente do servidor HTTPS, atualmente `https://voadesk.onrender.com`. `modo-online.flag` define esse padrão sem conter dados privados. Para testar somente nesta máquina, abra **AbrirTecnicoLocal.bat** e use **Abrir meu código** na interface para iniciar o cliente no servidor local correto.

## Atendimento

1. O cliente abre o aplicativo e informa seu código ao técnico.
2. O técnico digita o código ou seleciona um cliente salvo e solicita acesso.
3. O cliente confere o solicitante e clica **Aceitar conexão**, autorizando controle, monitores e transferência de arquivos. Pode recusar ou encerrar a qualquer momento.
4. A captura começa sem o seletor de monitor do navegador nos clientes novos. O técnico escolhe o monitor pela barra da sessão, que também oferece zoom, ajuste à tela, qualidade, diagnóstico, orientação e arquivos.
5. **Arquivos ↔** permite navegar nas pastas do cliente, receber um arquivo pelo seletor de salvamento e enviar um arquivo para a pasta aberta. O destino padrão de envio é Downloads/VoaDesk. Arquivos existentes no cliente são preservados.
6. Encerrar em qualquer ponta revoga o atendimento e libera entradas mantidas. Fechar a janela do técnico cancela transferências e encerra seu servidor auxiliar. Uma interrupção exige nova autorização.

A janela é redimensionável, com minimizar, maximizar e fechar. Tela cheia acompanha o estado do vídeo no WebView2; Escape libera o teclado remoto. Uma segunda abertura revela a instância existente. Atalhos reservados pelo Windows não são interceptados: **CTRL+ALT+DEL, UAC, aplicativos elevados e área segura continuam limitados**. O botão CTRL+ALT+DEL explica a indisponibilidade; Gerenciador de Tarefas é uma ação separada.

## Buscar clientes

Em Início, use **Nome ou código de acesso** para encontrar um cliente salvo. A busca aceita partes do nome ou código, nomes sem acentos e códigos com espaços ou hífens. Use o mouse ou as setas e Enter para selecionar uma sugestão; em seguida clique em **Solicitar acesso**. Escape fecha as sugestões, e o botão × limpa a busca. O filtro de **Clientes salvos** usa a mesma correspondência.

A busca acontece na agenda já carregada, sem consultar computadores ou enviar solicitações. A autorização de atendimento continua obrigatória. Consulte [a investigação do AnyDesk, evidências e decisões da adaptação](docs/anydesk-search.md). Validação local: `npm run test:search`.

Use **Buscar em** para restringir a nome ou código. As sugestões indicam o campo encontrado; **Ver todos os resultados** abre a lista completa com a consulta e o filtro preservados. Internamente, o índice normalizado é preparado quando a agenda muda e reutilizado durante a digitação. A [comparação interna de TeamViewer, AnyDesk e RemotePC](docs/search-internals-comparison.md) registra os artefatos, métodos recuperados e limites da investigação.

## Testar sozinho nesta máquina

No aplicativo Técnico, selecione **Testar nesta máquina** em Início. A conexão abre uma tela simulada com bloco de notas, janela que pode ser arrastada, contador de cliques e área de desenho. Clique no bloco para digitar, teste a roda do mouse e use **Reiniciar teste** para começar de novo. **Sair do teste** fecha os dois pares WebRTC e descarta as atividades.

O vídeo da tela simulada e os comandos de mouse/teclado passam por WebRTC dentro da mesma janela. Esse modo funciona sem servidor de sinalização, código, identidade de cliente ou aplicativo Cliente. Não captura nem controla o Windows e não altera agenda, histórico ou arquivos. Não valida captura nativa, controle do sistema operacional ou acesso entre computadores. Alterações no conteúdo são mantidas somente em memória durante o teste.

Validação local: `npm run test:local-screen` verifica vídeo decodificado, comandos, reinício, encerramento, reconexão e ausência de chamadas de sessão ao servidor, usando serviços e dados temporários.

## Dados e segurança

Agenda e histórico continuam em `.runtime/saved-clients.json` e `.runtime/history.json`. O modo local preserva `.runtime/pairing-devices.json`. A configuração protegida do operador é lida de `.runtime/operator-settings.json` ou, se ausente, `%LOCALAPPDATA%/VoaDesk/operator-settings.json`. Não copiar esses arquivos para o GitHub ou para o ZIP.

O novo perfil do técnico fica em `.runtime/voadesk-webview2-profile`; o perfil antigo do Edge é preservado. Identidades do cliente permanecem em `%LOCALAPPDATA%/VoaDesk/client`, por endpoint, com DPAPI/ACL existentes. Não há migração de formato nem redefinição incidental de identidade ou código.

O host serve apenas em `127.0.0.1`, com porta dinâmica para a interface. A sinalização de desenvolvimento mantém a porta local 47832 para preservar a identidade existente; se ocupada, a janela informa o conflito sem encerrar outros processos. Cookie HttpOnly/SameSite Strict, Host, origem, CSP, limites de corpo e revisões de autorização permanecem ativos. A autenticação inicial da janela passa somente por pipes privados; não vai em argumentos, URLs ou JavaScript público.

O WebView2 bloqueia navegação externa, novas janelas, objetos nativos genéricos e mensagens web para o host. As páginas não recebem acesso irrestrito ao Windows. Os seletores de arquivo mantêm as permissões do runtime. Não são desativados sandbox, validação TLS, firewall, Defender ou UAC.

Arquivos usam um DataChannel confiável separado, em blocos confirmados de 16 KiB, sem carregar o arquivo inteiro na memória e sem limite fixo em MB/GB. Há limites naturais de espaço livre, permissões, sistema de arquivos e duração da sessão (até oito horas). Não há retomada depois de desconectar. Escritas incompletas no cliente usam `.partial` e são removidas ao cancelar ou encerrar. A transferência não usa armazenamento do Render.

## Arquitetura e limites atuais

- `native/Launcher.cs` e `TechnicianWindow.cs`: janela, runtime, instância única, autenticação privada e ciclo de vida do auxiliar.
- `src/host/server.mjs`: interface autenticada em loopback, agenda, histórico e proxy de sinalização.
- `src/ui/`: interface reutilizada dentro do WebView2.
- `native/ClientApp.cs`, `DesktopBridge.cs` e `RemoteInput.cs`: cliente portátil, captura, monitores, arquivos e entrada autorizada.
- `src/video/`: H.264/WebRTC, qualidade, estatísticas e protocolo de arquivos. A captura nova está incorporada ao EXE do cliente.
- `src/pairing/`: códigos, presença e autorização. Os assets públicos legados continuam disponíveis para clientes anteriores à ponte nativa.

A captura nativa usa GDI/JPEG em loopback e canvas/WebRTC H.264, com alvo de até 60 capturas/s em SDR. A taxa efetiva depende do tempo de captura e do ajuste de qualidade. Para testar a fluidez, selecione **Imagem → Fluidez** com **Ajustar automaticamente** e veja os FPS, o RTT e a espera no buffer em **Diagnóstico → Detalhes técnicos**. STUN/TURN é configurável no servidor para clientes novos; sem essa configuração, o teste entre computadores exige a mesma LAN. Nenhum relay externo foi provisionado.

No Render sem disco, presença e sessões são efêmeras; os códigos são derivados da identidade privada e da chave existente do servidor. Reinícios encerram sessões. Isso não equivale a banco persistente ou histórico no servidor. WebRTC usa DTLS-SRTP/SCTP; não anunciar autenticação pessoal externa ou E2EE verificada independentemente do servidor.

## Desenvolvimento e validação

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-test-tools.ps1
npm run test:desktop
node tools/fragmented-upload-regression.mjs
node tools/native-bridge-smoke.mjs
node tools/native-race-smoke.mjs
node tools/native-features-smoke.mjs
npm run test:client
npm run test:update-ui
npm run package:installation
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify-installation.ps1
```

`npm start` abre o aplicativo Windows local. O build usa o compilador .NET Framework do Windows e baixa o SDK WebView2 oficial fixado em versão/hash na primeira execução. A distribuição inclui Node.js e as bibliotecas/avisos do SDK; não inclui o runtime Evergreen, cuja disponibilidade é verificada na abertura. Os testes de navegador usam `FAROL_PLAYWRIGHT`, ou a instalação de QA em `.cache/security-tools`.

O teste `native-technician-smoke.mjs` abre o WinForms/WebView2 real, serviços descartáveis em localhost e uma fonte sintética com coletor de entrada. Confere H.264, sessão, monitores, arquivos, preservação de dados e encerramento. O modo opcional `--pickers` solicita interação com seletores reais. Relatórios e imagens ficam em `artifacts/`, fora do GitHub e dos pacotes.

**Vídeo sintético, autorização e SDP não provam captura ou controle reais entre computadores.** A homologação entre dois Windows deve incluir resoluções/DPI diferentes, mouse/teclado reais, arquivos grandes, queda de rede e encerramento em ambas as pontas. Consulte [a arquitetura Windows e a validação](docs/technician-windows.md) e [a captura nativa](docs/desktop-session-local.md).

## Publicação e manutenção

O serviço público continua executando `src/start.mjs` com `VOADESK_MODE=pairing`. O desktop usa outro modo e não é exposto pelo Render. Publicação exige pedido explícito; a convenção do projeto está em `.agents/skills/commit/SKILL.md`.

O repositório mantém código, testes, scripts e documentação. Pacotes, caches, evidências locais, perfis, identidades, históricos e credenciais permanecem fora dele. Documentos de versões anteriores preservam decisões históricas e não substituem este README.

Código próprio: MIT. Node.js acompanha sua licença e avisos. O SDK WebView2 acompanha LICENSE/NOTICE; o runtime Evergreen e Windows têm seus próprios termos. Não há conclusão sobre licenciamento comercial de patentes H.264 ou assinatura Authenticode dos executáveis do projeto.

## Interface de atendimento

A interface foi revisada com fundo branco, navegação compacta, início separado entre iniciar e receber atendimento, histórico local e ferramentas de sessão agrupadas. A tela cheia é uma ação explícita. O cliente nativo oferece Copiar código e Reconectar visíveis, com estados de consentimento e encerramento.

Consulte [mapa dos controles, validações e limites](docs/interface-windows.md). Os testes de escala WebView2 e de layout WinForms não equivalem à troca do DPI do Windows em monitores reais.

## Desempenho 0.7

Leitura HTTP local em blocos, fila de entrada com prioridade para eventos confiáveis, captura sem sobreposição e métricas por etapa. Consulte [auditoria, configuração ICE, testes e pendências](docs/performance-0.7.md). As metas de FPS e latência dependem de validação entre computadores.
