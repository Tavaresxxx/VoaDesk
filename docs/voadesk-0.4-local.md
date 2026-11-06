# VoaDesk 0.4 · relatório local

Entrega de 5 de novembro de 2026, sem push/deploy. Interface e cliente atualizados no workspace.

## Executado

- 26 testes Node passaram: autorização, papéis, ticket de uso único, origem/cookie, fila limitada, revogação, estabilidade de adaptação, estatísticas, persistência e fluxos anteriores.
- Build C# x64 concluído com .NET Framework. Cliente com logo, ícone V, código persistente, consentimento e bandeja.
- Cliente nativo: janela inicial oculta em modo background, solicitação identificada mostrou a janela, visualização dependeu de clique e encerramento foi exercitado. Não alterou o auto início desta conta.
- Entrada: caracteres Unicode, scan codes, coordenadas e liberação passaram em sink de teste. A ponte HTTP real até a desserialização nativa e a liberação de tecla/botão no encerramento foram exercitadas; nenhuma entrada foi injetada no Windows. Existem dois monitores ativos no executor. O teste isolado utiliza sink sem efeitos e dispensa a restrição de topologia; o produto normal continua bloqueando controle/orientação com mais de um monitor.
- Atualização: assinatura válida, adulteração e expiração; troca atômica em fixture e preservação de .previous; tela substituiu código por Atualizar agora. Download seguido de instalação/reinício completo e login do Windows não foram executados. A fixture de atualização não foi publicada no endpoint operacional.
- Download do EXE pelo painel autenticado testado. Cliente portátil ZIP gerado sem dados privados.
- Windows Defender, scanner local de arquivo, concluiu sem ameaças reportadas para SHA-256 72f7109297f43a43d4cda4d6572b6bb9a133179dfdd8332accae97e07aafb6cf. Isso é somente o resultado desta análise, não garantia de ausência de ameaça ou alerta SmartScreen.

## Vídeo medido

Teste em 2026-11-05T20:36:14.900Z, duas páginas Edge headless 156.0.4314.58, 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz, 16 GiB RAM, mesma máquina/loopback, fonte canvas sintética 1920×1080 a 30 FPS. Movimento limitado a retângulo pequeno sobre texto e fundo estático; perfil Qualidade manual no instante final. H.264 real, sem comprovação de aceleração por hardware. O cenário não representa movimento de tela inteira.

| Métrica | Amostra final |
|---|---:|
| Largura | 1920.00 |
| Altura | 1080.00 |
| FPS da fonte | 30.00 |
| FPS codificados | 30.00 |
| FPS decodificados | 30.00 |
| FPS apresentados | 30.15 |
| Bitrate Mbps | 0.02 |
| RTT ms | 0.00 |
| Jitter ms | 19.00 |
| Perda % | 0.00 |
| Codificação ms/quadro | 6.40 |
| Decodificação ms/quadro | 1.28 |
| Espera no buffer ms | 0.13 |
| Congelamentos acumulados | 0.00 |
| Quadros descartados | 0.00 |
| Codec | video/H264 |
| Encoder | não exposto |
| Decoder | não exposto |
| Encoder eficiente (não prova GPU) | não disponível |
| Decoder eficiente (não prova GPU) | não disponível |
| Caminho | local-direct |
| Latência visual completa | não disponível |

Amostra curta de integração, não média sustentada nem benchmark p95. Jitter, codificação, buffer e decodificação são estatísticas fornecidas pelo runtime. Não houve medição ação→retorno visual. Os contadores de apresentação não comprovam o scanout físico.

## Ainda não validado

Captura de monitor real pelo seletor, entrada em editor/planilha, acentos/AltGr no Windows, precisão por DPI, overlay em captura real, rede limitada/perda/jitter, TURN, duas máquinas, 1080p60 real, sessão de 30 minutos, latência p95 e primeira experiência com pessoa sem familiaridade. Faltam dois computadores de teste, uma configuração de monitor único SDR para entrada e participação dessa pessoa. O produto loopback atual não deve ser descrito como suporte via internet.

## Fontes e decisões

A Microsoft registra que baixa latência pode reduzir a qualidade de codificação/decodificação: [CODECAPI_AVLowLatencyMode](https://learn.microsoft.com/en-us/windows/win32/medfound/codecapi-avlowlatencymode). O build usa WebRTC do Edge e não afirma ter configurado diretamente essa propriedade de Media Foundation. A política mede e ajusta bitrate/FPS/escala com histerese; a preferência continua disponível.

As métricas de perda, quadros descartados, congelamentos, totalDecodeTime e jitterBufferDelay seguem a definição e disponibilidade do [W3C WebRTC Stats](https://www.w3.org/TR/webrtc-stats/). A classificação é indício, não diagnóstico conclusivo de internet ou GPU. Retransmissão é identificada por candidato relay quando houver, mas não há TURN configurado nesta versão.

Entrada segue as permissões UIPI do [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput): sem controle de aplicações elevadas ou área segura. Atualização assinada por chave da aplicação não substitui assinatura Authenticode e reputação de distribuição, conforme [Microsoft SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Evidências reproduzíveis

- artifacts/support-local/support-smoke.json
- artifacts/support-local/native-session.json
- artifacts/support-local/native-bridge.json
- artifacts/support-local/native-features.json
- artifacts/support-local/update-ui.json
- artifacts/support-local/antivirus-check.json
- artifacts/voadesk/client-smoke.json

Comandos e pré-requisitos estão no README; procedimento para as verificações restantes em validation-0.4.md. O teste de UI de atualização precisa de chave local correspondente à pública incorporada. Nunca publicar chaves privadas ou perfis de testes.
