# VoaDesk 0.5.0 — validação local e viabilidade de acesso web

> Análise histórica anterior à decisão de implementar o técnico Windows 0.6. As recomendações de portal web abaixo não foram implementadas. Para a arquitetura entregue e a investigação posterior do ECONNRESET, consulte [Técnico Windows](technician-windows.md) e o [README atual](../README.md).

Data: 6 de novembro de 2026. Escopo: código em `C:\AcessoRemoto`, testes descartáveis em localhost e consulta à documentação oficial das APIs web. Nenhum push, deploy, alteração de serviços ou credenciais foi realizado.

## Conclusão

É viável oferecer o atendimento do técnico inteiramente em um site, sem Node.js, launcher ou ZIP no computador do técnico. Isso exige adaptar a aplicação atual; a interface já é web, mas o servidor que a atende hoje é local.

Não é viável manter todas as funções de controle do Windows usando apenas duas páginas web comuns. Para controle de outros aplicativos, captura nativa sem seletor a cada início e funcionamento em segundo plano, o computador atendido continua precisando de um componente nativo, portátil ou instalado. Uma PWA não acrescenta essas permissões do Windows.

Um modo opcional de visualização, iniciado pelo cliente no navegador, é viável com compartilhamento explícito de tela. Esse modo ainda precisa ser implementado: a captura atual depende da ponte nativa e encerra quando ela está ausente.

## Verificações executadas nesta análise

| Verificação | Resultado e limite |
|---|---|
| `npm test` | Primeira execução: 46/47 aprovados, com `ECONNRESET` no teste de fragmentos UTF-8/upload chunked. Repetição ao final, sem os outros ensaios em andamento: 47/47 aprovados. |
| `node --test --test-concurrency=1 tests/*.test.mjs` | 47/47 aprovados. Isso não elimina a falha observada na execução padrão. |
| `tools/build-test-tools.ps1` | Compilação Windows e ferramentas de teste concluídas. O cliente recompilado usa o endpoint loopback padrão. |
| `tools/desktop-session-smoke.mjs` | Aprovado: vídeo H.264 sintético; dois monitores enumerados e seleção exercitada; entrada entregue a coletor; tela cheia e zoom; transferência nos dois sentidos, conteúdo conferido, destino existente preservado e parcial removido ao cancelar; encerramento removeu o vídeo. |
| `tools/redesign-smoke.mjs` | Aprovado: cinco larguras (320, 390, 760, 1024 e 1440 px), teclado, busca, movimento reduzido e dez estados com zero violações detectadas pelo axe nos critérios configurados. Isso não equivale a uma auditoria manual completa. |
| `tools/native-race-smoke.mjs` | Aprovado: resposta atrasada descartada após encerramento e liberação de tecla/botão no coletor. Nenhuma entrada real injetada no Windows. |
| `tools/native-features-smoke.mjs` | Aprovado: Unicode, coordenadas, liberação de entrada, assinatura de atualização, recusa de adulteração/expiração e troca atômica com versão anterior preservada. Não executou o instalador completo. |
| `tools/security-load.mjs` | Aprovado segundo os critérios do ensaio: saúde HTTP sem erros até 384 conexões concorrentes, respostas 429 na limitação de frequência, manutenção de saúde por 30 segundos, recuperação e encerramento dos 128 uploads incompletos por prazo. Nos estágios intencionais acima da capacidade houve resets de conexão; não é capacidade de sessões de vídeo. |

Os testes de transferência usaram arquivos de aproximadamente 512 KiB e 1 MiB. A aceitação de um tamanho declarado de 5 GiB foi exercitada, mas não houve transferência real de 5 GiB. O seletor de salvamento do técnico foi substituído por uma implementação de teste no ensaio integrado.

A falha de conexão da primeira suíte é uma pendência de confiabilidade do teste/caminho HTTP. A causa não foi estabelecida nesta análise; não se deve alterar a asserção para aceitar qualquer reset nem anunciar que o problema foi corrigido porque a execução sequencial passou.

## Dependências encontradas no código atual

- `src/host/server.mjs`: serve o painel em `127.0.0.1`, mantém a credencial do operador no processo local, faz a intermediação da API e grava agenda/histórico em arquivos locais. Não é um portal público com contas de usuários.
- `src/pairing/session-http.mjs`: as rotas nativas/operador rejeitam requisições com cabeçalho Origin. Publicar somente os arquivos HTML/JS não substitui a intermediação autenticada atual.
- `src/pairing/sessions.mjs`: `SessionHub.current` mantém um atendimento por instância. `src/host/server.mjs` também mantém um único `sessionToken` por host. Hospedar isso para vários técnicos exige separar estado e autorização por usuário/sessão.
- `src/video/capture.mjs`: busca quadros em `/support/native/frame`, usa canvas a 15 capturas/s e envia vídeo por WebRTC. Não há fluxo ativo de captura puramente web nessa página.
- `native/DesktopBridge.cs` e `native/RemoteInput.cs`: capturam a tela via `CopyFromScreen`, acessam arquivos e aplicam entrada via `SendInput`. São as funções que uma página web comum não substitui integralmente.
- `src/ui/session-files.mjs`: o técnico já recebe arquivos com File System Access e envia arquivos selecionados no navegador. O acesso às pastas do atendido vem da ponte nativa.
- `src/video/peer.mjs`: `iceServers: []`. Não há STUN/TURN configurado; o sucesso em localhost não estabelece conectividade entre redes distintas.

## Possibilidades por função

| Função | Somente navegador |
|---|---|
| Painel do técnico, código, solicitação e visualização | Viável com backend web autenticado e integração da sinalização. |
| Mouse/teclado do técnico enviados ao computador atendido | Viável no navegador do técnico; aplicação no Windows atendido depende de agente/serviço nativo. |
| Cliente compartilhar tela para orientação, sem EXE | Viável em modo próprio, com gesto e seletor do navegador e compatibilidade verificada. |
| Captura automática e troca livre de todos os monitores após uma autorização | Não reproduzível integralmente pela API web comum: o usuário controla a escolha da superfície compartilhada. |
| Arquivos selecionados pelo usuário | Viável com permissões e APIs compatíveis; não concede acesso arbitrário ao disco. |
| Navegar pelo disco do atendido como no fluxo atual | Depende do componente nativo, ou de um modo web limitado às pastas explicitamente escolhidas pelo atendido. |
| Iniciar com Windows, sobreviver ao fechamento do navegador, controlar outros aplicativos | Exige componente nativo para preservar a experiência atual. |
| UAC, área segura e CTRL+ALT+DEL | Não resolvidos pelo navegador; o cliente portátil atual também não entrega esse controle. |

## Arquitetura recomendada

Manter um cliente Windows pequeno no computador atendido e transformar o técnico em portal HTTPS. O navegador recebe vídeo, envia comandos e transfere arquivos; o cliente mantém consentimento visível, captura, entrada e encerramento. O servidor autentica o técnico e sinaliza a sessão. TURN oferece retransmissão quando a conexão direta não funciona; precisa de configuração e validação próprias.

Para chegar a esse formato:

1. Criar autenticação por conta e sessões web protegidas; manter credenciais do servidor fora do JavaScript público.
2. Hospedar o painel e as rotas necessárias em HTTPS, separando usuários e atendimentos. Não expor o host loopback atual diretamente à internet.
3. Definir persistência e migração da agenda/histórico, preservando dados e identidades existentes. A chave atualmente usada na derivação dos códigos não deve ser trocada incidentalmente durante essa migração.
4. Configurar ICE/STUN/TURN, credenciais temporárias de retransmissão e testar redes distintas.
5. Revisar a ação Receber acesso no portal: oferecer o cliente compatível; executar um EXE depende de abertura pelo usuário ou de integração local previamente instalada.
6. Manter Edge/Chrome desktop como alvos iniciais, verificando APIs de arquivos, atalhos e tela cheia. Outros navegadores e dispositivos precisam de homologação específica.
7. Acrescentar, se desejado, um modo separado de orientação por compartilhamento de tela no navegador, com escopo e consentimento próprios.

## Implantação

O serviço publicado não foi consultado nem alterado. A pasta atual não contém metadados `.git`; não foi possível comparar este código com um commit remoto. Nenhuma equivalência com o código em produção foi estabelecida. Os EXEs em `dist` foram recompilados para localhost; não são uma nova entrega publicada nem substituem a validação dos arquivos de `instalação`.

## Validações entre computadores ainda necessárias

- Imagem real, mouse/teclado em aplicativos, acentos/AltGr, DPI e coordenadas de diferentes monitores.
- Dois Windows na LAN e, separadamente, redes diferentes com TURN, perda de rede e reconexão com nova autorização.
- Latência visual, qualidade de texto, movimento, uso de CPU e sessão sustentada. As estatísticas locais não comprovam 60 FPS ou aceleração por hardware.
- Arquivos realmente grandes, pouco espaço, permissões e interrupções durante transferência.
- Atualização completa com reinício e preservação dos dados; UAC/área segura permanecem limitações próprias.

Pareamento, autorização ou troca de SDP não provam vídeo e controle funcionais entre computadores.

## Evidências locais

- `artifacts/desktop-local/desktop-session.json`
- `artifacts/redesign-local/report.json`
- `artifacts/support-local/native-bridge.json`
- `artifacts/support-local/native-features.json`
- `artifacts/security-local/load-2026-11-06T19-44-43-232Z.json`

## Documentação oficial consultada

- [W3C Screen Capture](https://www.w3.org/TR/screen-capture/): seleção da superfície pelo usuário, ativação transitória e ausência de permissão persistente de captura no fluxo comum.
- [Chrome: Captured Surface Control](https://developer.chrome.com/docs/web-platform/captured-surface-control): rolagem e zoom de aba capturada; não é controle geral do desktop.
- [Chrome: File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access): acesso a arquivos/pastas mediante seleção e permissão, em contexto seguro.
- [Microsoft: SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput): injeção nativa de entrada e restrições UIPI.
