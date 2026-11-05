# Evidências do incremento 01

Data do ensaio principal: 2026-11-05, 18:04:40 UTC / 15:04:40 America/Sao_Paulo.
Resultado: **prova sintética local aprovada nos fluxos exercitados**. Não é aprovação de suporte remoto ou benchmark de duas máquinas.

## Condições registradas

- Windows `10.0.26200`, x64 (Windows 11), Intel Core i5-1135G7 2,40 GHz, 8 CPUs lógicas, 16 GiB de RAM.
- GPU reportada pelo CDP: Intel Iris Xe Graphics, driver Intel `32.0.101.7088`; também enumera Microsoft Basic Render Driver `10.0.26100.9711`. WMI foi negado; coleta alternativa em `artifacts/environment.json`.
- Edge `156.0.4314.58`, modo headless, viewport CSS 1440 × 1040, DPR 1, Node `24.21.0`. Não houve controle de energia/temperatura ou isolamento de carga de outros aplicativos; este não é o hardware de referência homologado.
- QueryDisplayConfig/AdvancedColorInfo2: duas telas SDR, canais de 6 e 8 bits conforme driver. **Não se capturou o desktop neste teste**; fonte foi canvas SDR 1920 × 1080 com texto/colorido, tabela e retângulo em movimento contínuo.
- Dois RTCPeerConnection no mesmo renderer. Sem STUN/TURN, sem rede emulada ou segundo computador. Candidatos host, caminho direto local, DTLS-SRTP.
- H.264 negociado: `level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f`. Chroma/codec internals não foram inspecionados; não afirmar 4:4:4 ou ausência de cópias de memória.
- Perfis: Qualidade 16 Mbit/s/30 FPS/escala 1; Equilibrado 8 Mbit/s/60 FPS/adaptação balanced; Fluidez 5 Mbit/s/60 FPS/limite 1080p/maintain-framerate. Bitrates configurados são tetos. Não houve contenção de banda.
- Opção de laboratório no perfil isolado: `--disable-features=WebRtcHideLocalIpsWithMdns`, conforme decisão documentada. Sem essa opção o teste inicial não conectou: candidatos presentes, ICE/DTLS sem par selecionado, 0 quadros após 15 s. Com ela houve conexão, mídia e apresentação. Não se desativou sandbox, TLS ou firewall.

## Amostras por perfil

Cada linha é **a última amostra de aproximadamente 1 segundo após esperar 5,5 s no perfil**; não são médias, p95 ou garantias. FPS de fonte se refere à fonte entregue ao WebRTC; apresentação mede submissões ao compositor expostas via callback, não scanout físico.

| Perfil | Resolução | FPS fonte / encode / decode / apresentação | Bitrate medido | Encode / decode por quadro | RTT |
|---|---|---|---:|---:|---:|
| Qualidade | 1920 × 1080 | 30 / 30 / 30 / 29,5 | 0,730 Mbit/s | 6,47 / 2,09 ms | 1 ms |
| Fluidez | 1920 × 1080 | 60 / 61 / 60 / 60,0 | 1,553 Mbit/s | 6,15 / 1,87 ms | 1 ms |
| Equilibrado | 1920 × 1080 | 60 / 60 / 60 / 58,0 | 1,643 Mbit/s | 6,93 / 2,77 ms | 1 ms |

O campo FPS do WebRTC é estimado/arredondado numa janela; a amostra de 61 não representa meta sustentada acima de 60. Cada amostra mostrou 0 pacotes perdidos e 0 descartes na recepção. Não há medida de descartes internos por etapa ou filas do capturador/encoder. Não inferir descarte zero em todo o pipeline.

O Chromium reporta recursos `video_encode`, `video_decode` e `gpu_compositing` habilitados, mas **getStats não expôs encoderImplementation, decoderImplementation nem powerEfficientEncoder/Decoder**. Portanto o uso efetivo de hardware nessa sessão está **não confirmado**. Suporte da GPU não prova seleção do encoder. Precisam ser coletados contadores/trace externos antes de aprovar esse requisito.

## Duração e memória

Sessão principal: início 18:04:41.153 UTC, última amostra 18:06:05.851 UTC, 84 amostras, 4.803 quadros codificados e 4.802 decodificados na última coleta. O quadro em trânsito no instante da coleta não é evidência de perda. Ensaio adicional sintético de 60 s dentro dessa sessão: 18:05:05.886 a 18:06:05.928 UTC.

CDP aos 30/60 s do período adicional: heap usado 3.327.072 → 3.424.204 bytes; heap reservado 4.317.184 → 4.579.328; documentos 1 → 1; nós 987 → 1.195. Não foi forçada coleta de lixo. Dois pontos com crescimento não permitem estimar vazamento, estabilidade ou consumo total de GPU/processos. **Teste de 30 min e memória total ainda não executado.** O buffer de métricas é limitado a 1.800 amostras e foi verificado com 7.200 inserções; isso limita dados da aplicação, não comprova estabilidade de todo o runtime.

## Fluxos realmente exercitados

- Seis testes Node passaram: seleção estrita H.264, perfis/escalonamento, bloqueio por estado de cor, matemática das métricas, buffer limitado e proteções HTTP/histórico.
- Teste integrado passou: consentimento; vídeo H.264 com decode/apresentação; três perfis; 1:1 físico; tela cheia mantendo Encerrar; parada limpando srcObject; histórico; renovação de consentimento; captura atrasada após cancelamento sem ressuscitar sessão; duas reinicializações adicionais; nenhum pageerror.
- Verificação final adicional, 18:09:37 UTC, em `artifacts/final-check/video-smoke.json`: repetiu os fluxos e comprovou que derrubar o host local encerra o vídeo/libera srcObject em até 8 s. A ausência/negação do heartbeat agora é tratada como perda do host. A perda real de rede entre duas máquinas continua pendente.
- Compilação C# x64 de `Farol.exe` e `FarolProbe.exe` passou. O helper retornou JSON válido com o estado de cor.
- O launcher abriu uma janela Windows com título Farol. A inspeção nativa via habilidade Computer Use foi interrompida pela ferramenta, que não conseguiu verificar a URL do navegador com confiança. Não houve confirmação do seletor ou captura real por essa via; procedimento manual em `validation.md`.
- Inspeção visual do screenshot da UI e do quadro sintético H.264 de Qualidade em 1920 × 1080: textos/tabelas/linhas reconhecíveis, proporções preservadas. Sem comparação objetiva alinhada, avaliação de recuperação após rolagem ou aprovação formal de legibilidade. O preview ajustado à janela reduz os textos; verificar 1:1 para avaliar o codec.

## Ainda não medido ou implementado

Latência completa ação→visual, p95 ≤150 ms, 30 min sem degradação, captura WGC/DXGI efetiva, fluxo GPU zero-copy, hardware efetivo, tone mapping HDR, texto após rolagem/arraste reais, entrada remota, comportamento UAC, duas máquinas, autenticação/pareamento/consentimento remoto, redes distintas, NAT, TURN, adaptação sob banda/jitter/perda. Esses itens não são considerados entregues pela prova sintética.

Faltam: segundo computador Windows acessível; servidor de identidade/sinalização implementado e HTTPS/WSS; coturn público e dois links; câmera/gatilho para latência física; coleta GPU/memória externa e tempo de ensaio de 30 min. A captura real está disponível no código, mas a validação do seletor e pixels do desktop permanece manual.

## Artefatos reproduzíveis

- `artifacts/video-smoke.json`: resultado, asserções, amostras por perfil e duas coletas de heap/DOM.
- `artifacts/video-local-raw.json`: série de 84 amostras sem mídia, SDP ou teclas.
- `artifacts/environment.json`: ambiente e capacidades do navegador.
- `artifacts/video-synthetic.png`: interface renderizada com diagnóstico.
- `artifacts/synthetic-quality-1080.png`: quadro decodificado sintético em resolução original.
- `artifacts/final-check/video-smoke.json`: verificação final com falha deliberada do host local.

Executar novamente conforme `validation.md` substitui os artefatos. Preservar uma cópia identificada antes de comparar novas versões. Nenhuma pontuação SSIM/PSNR ou número de latência física foi inventado.
