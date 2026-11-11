# Recuperação de conexão 0.7.2

## Diagnóstico e comparação

A análise foi do código do VoaDesk e da documentação pública dos fornecedores; não houve inspeção dos binários proprietários do AnyDesk ou TeamViewer.

- AnyDesk documenta tentativa de restaurar uma sessão interrompida: https://support.anydesk.com/docs/error-messages
- TeamViewer documenta caminhos TCP/UDP e portas alternativas, com diferenças por plataforma/versão: https://www.teamviewer.com/en/global/support/knowledge-base/teamviewer-remote/troubleshooting/ports-used-by-teamviewer/
- WebRTC distingue desconexão transitória de falha terminal: https://www.w3.org/TR/webrtc/

O VoaDesk encerrava imediatamente nos dois lados ao receber `disconnected`. Além disso, a captura encerrava ao receber um único HTTP 503/reset de conexão, ao falhar um envio de entrada e ao falhar uma alteração opcional de qualidade. A correção 0.7.1 cobria 429 e sinalização, mas não esses caminhos.

Foi reproduzida uma queda da versão 0.7.1 com um único HTTP 503 no endpoint de quadros. Evidência anterior em `.cache/before-recovery-0.7.2/reproduced-frame-503.json`. Isso confirma um defeito recuperável, mas não identifica definitivamente o gatilho dos dois computadores do usuário.

## Alterações

- Ambas as pontas preservam a conexão por até oito segundos em `disconnected`; recuperação cancela o temporizador. Falha terminal é informada. Encerramento manual cancela qualquer recuperação.
- Captura tolera erros transitórios de HTTP/rede por até oito segundos desde o último quadro bom, sem repetição acelerada.
- Falha transitória de entrada descarta o lote e a fila; só repete a liberação de teclas/botões, durante até cinco segundos. Comandos antigos não são repetidos. Entradas novas são descartadas durante essa recuperação.
- Falha na alteração opcional de qualidade e no envio de métricas não encerra o vídeo. Erros de autorização continuam tratados pelas consultas de estado e pela ponte nativa.
- Registro técnico limitado aos últimos 80 eventos no armazenamento local da origem do navegador, sem SDP, tokens, IDs ou conteúdo de comandos. Não é um log centralizado: a origem local pode mudar ao reabrir o aplicativo.
- Preservados consentimento, limites de autorização, watchdog e revogação imediata.

Não foi adicionado relay próprio, provisionado TURN, aberto firewall, alterada credencial ou implementada renegociação ICE. Recuperação aqui significa manter o transporte existente durante uma oscilação transitória; uma falha terminal ainda exige nova solicitação autorizada. Portanto, não se afirma equivalência de infraestrutura com AnyDesk/TeamViewer.

## Verificação

- 66 testes Node passaram, incluindo prazo de desconexão, recuperação e descarte dos callbacks ao encerrar.
- `tools/desktop-session-smoke.mjs`: vídeo H.264 sintético via ponte C#, HTTP 429/503, reset de conexão, falha de configuração do encoder, estado transitório WebRTC nas duas pontas e falha de entrada. Todos recuperaram; arquivos bidirecionais, hashes, encerramento e acessibilidade também passaram.
- Estado WebRTC foi simulado no teste; não representa perda de pacotes real.
- `tools/signal-delay-smoke.mjs`: atraso de 1,8 segundo, pausa e recuperação de entrada, expiração da autorização e revogação com HTTP 403 passaram.
- `tools/native-technician-smoke.mjs --soak-seconds=180`: janela WinForms/WebView2 real, vídeo sintético contínuo por três minutos, 18 amostras com avanço de quadros, arquivos e encerramento passaram. Esse teste não substitui o ensaio de 30 minutos nem valida dois computadores.
- Pacote 0.7.2 verificado por manifesto e hashes, sem dados privados. Atualizadas as duas cópias locais do Técnico, o Cliente avulso e os Clientes incluídos nas pastas do Técnico; três arquivos de configuração/dados conferidos sem alteração.
- A versão local não foi publicada. Teste físico entre dois computadores permanece pendente; um teste sintético não comprova captura e controle reais em rede.
