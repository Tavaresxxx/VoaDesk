# Auditoria e evolução de desempenho — VoaDesk 0.7

## Arquitetura encontrada

O projeto é C#/.NET Framework 4.8 no Windows e JavaScript/Node.js 22+;
não é Python. WebView2/Edge fornece WebRTC, H.264, DTLS-SRTP e SCTP.
Adicionar aiortc/FFmpeg ou migrar linguagens sem comparação aumentaria a
complexidade e quebraria a distribuição portátil atual.

Fluxo: identidade → solicitação → consentimento no cliente → ticket de uso
único → ponte autenticada em loopback → oferta/resposta por HTTPS → mídia e
DataChannels entre os pares. A sinalização não transporta o vídeo. Captura
GDI gera JPEG, o navegador decodifica e desenha no canvas, e WebRTC codifica
H.264. Comandos atravessam a ponte local e usam Windows SendInput.

## Diagnóstico e alterações

| Prioridade | Local | Evidência / alteração |
| --- | --- | --- |
| Alta | DesktopBridge.Handle | Cabeçalhos eram lidos um byte por operação assíncrona, inclusive com alocação do terminador a cada byte. Agora são lidos em blocos limitados a 16 KiB, preservando corpo recebido junto e cabeçalhos fragmentados. Duplicatas e framing ambíguo são rejeitados. |
| Alta | capture.captureNextFrame | Uma captura por vez, sem backlog de vídeo. Teto passa de 30 para 60; isso é teto de agendamento, não FPS garantido. |
| Alta | DesktopBridge.Native / CaptureJpeg | Capturas concorrentes são recusadas; quadros cuja geração de monitor mudou não são entregues. Codec JPEG é localizado uma vez; resolução da imagem intermediária acompanha o perfil/adaptação. Clientes antigos continuam recebendo resolução original. |
| Alta | InputQueue / capture.flushInput | Uma posição descartável, fila confiável limitada a 64, lotes de até 8. Cliques, teclas e release têm prioridade; clique/release remove movimento anterior. IDs evitam repetição confiável e movimento atrasado anterior a clique/release nos clientes novos. Canal de ponteiro aceita somente movimento. |
| Média | stats / session | Tempos reais de captura, JPEG, ponte+decode, desenho canvas, espera máxima de entrada e substituições do ponteiro. Confirmações medem ida/volta do comando pela ponte, incluindo fila. Não equivalem à latência visual nem comprovam que um aplicativo do Windows reagiu. |
| Média | QualityPolicy | Tempo excessivo na captura/ponte participa da redução com histerese existente. |
| Alta | ice-config / SessionHub / peer | STUN/TURN configurável; credenciais TURN HMAC por sessão expiram. Segredo compartilhado não sai do servidor. Configuração é fornecida somente após autorização e não é persistida em logs ou histórico. |

A leitura em blocos produziu ganho no ensaio sintético; TCP_NODELAY isolado
não mostrou ganho. Não atribuir a melhoria apenas à desativação de Nagle.

## Reprodução e critérios

Resultados locais em 09/11/2026, Windows, WebView2 157.0.4341.42:

| Medida | Antes | Depois |
| --- | ---: | ---: |
| FPS apresentados, amostra sintética de 2 s | 20,33 | 36,89 |
| Busca HTTP do quadro, últimas 30 requisições | 36,15 ms | 13,84 ms |

São amostras curtas da mesma máquina, sem isolamento de carga: +81% de FPS
nessa amostra e -62% no tempo HTTP não são garantias de ganho em uso remoto.
O ensaio sintético de 120 s passou, com quadros decodificados avançando de
413 para 3.779 entre a primeira e última coleta. Contador de descartes avançou
de 7 para 94; não se declara descarte zero. Heap do renderer variou com GC;
não há conclusão de vazamento ou medição de toda a memória do aplicativo.
Uma resposta 403 durante encerramento foi observada, conforme a revogação.

63 testes Node passaram, incluindo seis novos testes de fila, ICE e adaptação.
Passaram também os testes nativos de transporte, entrada, arquivos, atualização
assinada e revogação atrasada. A regressão de upload fragmentado completou
300 iterações. O teste de carga HTTP recuperou após saturação: não houve erros
no soak HTTP de 30 s com concorrência 32; com concorrência 640 ocorreram
1.019 ECONNRESET. Esse limite não permite anunciar escalabilidade ilimitada.

O primeiro soak revelou que a fixture sintética não renovava a presença e
expirava em 90 s. Foi corrigida para reproduzir o heartbeat que já existia no
ClientWindow real; não se alterou a expiração de segurança do produto.

```
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-test-tools.ps1
node tools/native-transport-smoke.mjs
node tools/native-bridge-smoke.mjs
node tools/native-race-smoke.mjs
node tools/native-features-smoke.mjs
node tools/native-technician-smoke.mjs --soak-seconds=120
node tools/fragmented-upload-regression.mjs
node tools/benchmark-performance.mjs <relatorio-anterior.json> <relatorio-atual.json>
```

Ensaios usam identidades temporárias, pixels sintéticos e coletor de entrada;
não aplicam comandos ao Windows nem gravam conteúdo da área de trabalho.
O teste da ponte cobre fragmentação, corpo pré-carregado, escala, autenticação,
duplicatas de cabeçalhos e recusa de Transfer-Encoding. O teste de fila aplica
um milhão de movimentos e confirma armazenamento constante do ponteiro.
O teste de revogação foi atualizado para o texto atual do botão Encerrar.
O parâmetro de soak mantém a sessão sintética e coleta quadros/descartes e
heap disponível a cada dez segundos; não mede toda a memória dos processos/GPU.

## Conectividade externa

Configuração opcional do processo de sinalização (não colocar valores reais no Git):

- `VOADESK_ICE_URLS`: array JSON de URLs `stun:`, `stuns:`, `turn:` ou `turns:`.
- `VOADESK_TURN_SECRET`: segredo coturn compartilhado com no mínimo 32 caracteres.
- `VOADESK_ICE_POLICY`: `all` (padrão) ou `relay` para ensaio que obrigue TURN.

Exemplo apenas local: `VOADESK_ICE_URLS=["stun:127.0.0.1:3478","turn:127.0.0.1:3478?transport=udp"]`.
Para desenvolvimento, executar coturn separadamente com `use-auth-secret`,
`static-auth-secret` igual ao segredo local, realm próprio e certificado válido
para TLS. Para produção são necessários endereço público, portas de escuta e
faixa de relay liberadas, certificado e limites/monitoramento de tráfego. O
serviço HTTP do Render existente não substitui coturn UDP/TCP. Não houve
provisionamento, cobrança, troca de credenciais nem configuração TURN externa.
Sem URLs configuradas, mantém-se o comportamento anterior com candidatos host.
Clientes novos consomem ICE recebido; executáveis antigos podem ignorar essa
configuração. Para testar entre redes, atualizar as duas pontas.

## Requisitos ainda não concluídos de melhoria.md

DXGI/WGC, pipeline sem JPEG intermediário, integração nativa de NVENC/Quick
Sync/AMF com seleção explícita e decodificação/renderização Direct3D não foram
implementados nesta versão. O navegador continua escolhendo o encoder; campos
de hardware ausentes permanecem indisponíveis. Não há evidência que justifique
uma migração completa para Python/C++/Rust neste incremento.

Faltam homologação em dois Windows, TURN público, redes distintas, perda/jitter
controlados, DPI físico/múltiplos monitores, GPUs NVIDIA/AMD/Intel, latência
ação→imagem e estabilidade de longa duração. Não confundir o soak curto com
homologação de oito horas ou as metas de 30–60 FPS e <100 ms com garantias.
Reconexão exige consentimento novo; não restaurar acesso automaticamente.

## Rollback e preservação

Fontes anteriores e evidência inicial foram preservadas em `.cache/performance-baseline`
somente nesta máquina. Reverter os arquivos deste incremento em um commit novo,
recompilar e redistribuir os dois aplicativos permite rollback. Não apagar
identidades, configurações, histórico ou agenda; os formatos são preservados.
No Render, reimplantar a revisão anterior restaura a sinalização, mas reinicia
as sessões efêmeras. Publicação de código não atualiza executáveis já abertos.

Referências técnicas: [WebRTC W3C](https://www.w3.org/TR/webrtc/),
[implantação Render](https://render.com/docs/deploys) e
[saúde Render](https://render.com/docs/health-checks).
