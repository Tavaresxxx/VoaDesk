# Farol — decisão de arquitetura / incremento 01

Documento histórico da primeira prova. A marca ativa é VoaDesk; cliente e pareamento adicionados na prévia 0.2 estão documentados em `voadesk-0.2.md`.

Data: 2026-11-05. Estado: prova local executável, sem acesso remoto.

## Evidências do ambiente

- Repositório vazio; nenhuma instrução AGENTS.md encontrada no workspace ou na raiz.
- Windows x64, PowerShell 5.1, Node 24.21.0, .NET runtimes 6/10, compilador C# .NET Framework disponível; sem SDK .NET, MSVC, CMake ou Cargo no PATH.
- Edge 156 instalado. Chromium e Playwright em cache para ensaios.
- HTTPS de saída para registry.npmjs.org indisponível no shell. WMI/CIM nega consulta de GPU. Não concluir que inexiste GPU por esse erro.

## Decisão para esta entrega

Aplicativo provisório **Farol**, launcher Windows C# + janela de aplicativo Edge + servidor local Node sem dependências npm. Sem instalação privilegiada. O servidor escuta exclusivamente em 127.0.0.1, porta dinâmica, e serve assets e metadados; nunca recebe vídeo. Perfil do Edge isolado no diretório de dados. Nenhum conteúdo remoto, CDN, extensão ou acesso Node a partir da página. Captura somente após gesto explícito e seletor do Windows/navegador. O usuário deve selecionar uma tela; janelas/abas são recusadas. Não há controle de entrada neste incremento.

O módulo de vídeo usa dois RTCPeerConnection no mesmo processo para exercitar captura → codificação H.264 → SRTP/ICE local → decodificação → apresentação. Não equivale a duas máquinas. Não usa STUN/TURN nem sinalização externa. O H.264 deve estar disponível nas duas pontas; ausência ou codec negociado diferente causa erro, sem fallback silencioso. Implementação e indicação de eficiência energética vêm de getStats, quando expostas. Não afirmar aceleração por hardware apenas porque a GPU do navegador está ativa.

Evidência adicional: Edge headless 156 reuniu candidatos ICE com mDNS, mas não resolveu candidatos remotos no loopback local; nenhum par selecionado ou quadro codificado após 15 s. Um ensaio isolado com `--disable-features=WebRtcHideLocalIpsWithMdns` conectou e apresentou H.264 1080p. O launcher usa essa opção **somente no perfil dedicado ao laboratório**, sem alterar Edge pessoal, sandbox, TLS ou firewall. A página passa a poder ver endereços privados ICE; não carrega conteúdo externo, não exporta SDP/candidatos e não recebe servidores ICE. Isso não é uma solução validada para redes diferentes e deverá ser reavaliado antes do modo remoto.

Stack alvo a confirmar: Electron mantido, UI TypeScript/JavaScript e WebRTC Chromium, Node para autenticação/sinalização num serviço único, coturn para retransmissão. Electron não pôde ser instalado aqui; não está sendo distribuído. A janela Edge é uma etapa de laboratório, não o empacotamento comercial final. Se o pipeline Chromium não cumprir nitidez/latência/hardware, substituir o adaptador por C++/WinRT + D3D11/MF + libwebrtc, mantendo UI/contratos. Essa decisão depende de medição, não preferência estética.

## Captura, GPU e codec

WGC oferece captura moderna de monitor/janela e integração D3D11; Desktop Duplication fornece superfícies e regiões modificadas/movidas, útil para desktop e cursor separado. WGC tem cuidados próprios de HDR; Desktop Duplication em BGRA8 também não resolve HDR sozinho. A API Web de captura não permite afirmar qual backend Chromium usou nem garantir superfícies GPU sem cópias. Isso deve ser medido antes de estabilizar a stack. Não implementamos um capturador GDI como solução definitiva.

H.264 primeiro pela interoperabilidade. WebRTC evita criar transporte/criptografia/codec próprios. Restringimos a variante packetization-mode=1 e preferimos constrained-baseline para interoperabilidade. Sem manipulação textual de SDP, B-frames ou controles de encoder não expostos. O Chromium controla as filas internas e o descarte seguro do codec; a aplicação não enfileira quadros nem descarta pacotes H.264 arbitrariamente. Não há acesso ao tamanho das filas internas neste protótipo.

Perfis: qualidade mantém escala 1 e prioriza resolução; equilibrado preserva 1:1 inicialmente e permite adaptação do encoder; fluidez limita resolução a 1080p e prioriza FPS. Bitrate é teto, não promessa. Congestion control nativo do WebRTC fica ativo; não há algoritmo adicional que oscile qualidade. Mudanças manuais são serializadas. Textos coloridos podem degradar em 4:2:0 mesmo com bitrate alto; nenhuma promessa de 4:4:4. Sem codec alternativo antes de comparação visual e medição.

HDR é consultado via QueryDisplayConfig/DisplayConfigGetDeviceInfo pelo helper nativo. HDR/WCG ativo ou estado desconhecido impede captura real neste incremento para não produzir uma conversão lavada silenciosamente. O ensaio sintético SDR continua disponível. Não implementado tone mapping HDR→SDR. Em monitores múltiplos, o gate é conservador para todas as telas ativas; a captura permite selecionar somente uma tela por sessão. Ao alterar monitores/cores, parar e reabrir o aplicativo.

## Limites entre módulos

- `native/`: bootstrap Windows e consulta de cor nativa. Nenhuma injeção de entrada.
- `src/host/`: assets locais, cookie de bootstrap, metadados do ambiente, encerramento por inatividade.
- `src/video/`: perfis, negociação, ciclo de vida, estatísticas agregadas e loopback.
- `src/ui/`: consentimento, estado visível, visualizador, diagnóstico, histórico local limitado.
- Sessão/autorização, entrada, servidor remoto e TURN: contratos e plano em `security-and-next.md`, sem implementação ou simulação de segurança de produção.

## Manutenção, distribuição e licenças

Código próprio MIT. Reutilizados: Windows/.NET Framework, Edge/Chromium/WebRTC e Node. Edge e Windows têm termos próprios; Node usa MIT e avisos de terceiros; Chromium/WebRTC têm BSD e múltiplas licenças transitivas. Não copiar binários do Edge nem redistribuir caches locais. A futura distribuição Electron requer preservar LICENSE/third-party notices e auditoria de versões; patentes/licenciamento H.264 precisam de análise específica antes de comercialização. Esta entrega não conclui liberação comercial de patentes.

Rejeitado Microsoft MixedReality-WebRTC: arquivado e sem H.264 desktop segundo o próprio projeto. SIPSorcery/libdatachannel, isoladamente, não comprovam captura/encode/decode por hardware integrada. libwebrtc nativo é mais controlável, mas o custo de build e integração GPU deve ser justificado pelas medições. Sem microserviços nesta fase.

## Fontes primárias consultadas

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/session
- https://www.w3.org/TR/webrtc/
- https://w3c.github.io/webrtc-stats/webrtc-stats.html
- https://chromium.googlesource.com/external/webrtc/+/master/video/g3doc/stats.md
- https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api
- https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture
- https://learn.microsoft.com/en-us/windows/win32/direct3darticles/high-dynamic-range
- https://learn.microsoft.com/en-us/windows/win32/medfound/codecapi-avlowlatencymode
- https://github.com/microsoft/MixedReality-WebRTC
