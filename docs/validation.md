# Procedimentos reproduzíveis

## Testes automatizados

Núcleo (Node 22+):

```powershell
node --test tests/core.test.mjs tests/host.test.mjs
```

Ensaio integrado: instale Playwright como ferramenta de desenvolvimento quando houver rede (`npm install --no-save playwright`) ou indique uma instalação existente. Não copie caches privados ou dependências de outros projetos para a distribuição. O ensaio importa a ferramenta somente pelo caminho informado.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1
$env:FAROL_PLAYWRIGHT = 'C:\caminho\node_modules\playwright\index.mjs'
$env:FAROL_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tools/video-smoke.mjs
```

O teste abre Edge headless, sem arquivos/telas reais, e usa cartela SDR 1080p gerada em canvas. Confere consentimento, três perfis, codec negociado H.264, quadros codificados/decodificados/apresentados, 1:1 físico, tela cheia com botão Encerrar, limpeza, histórico, cancelamento com aquisição atrasada e reinícios. Produz `artifacts/video-smoke.json`, `video-local-raw.json`, `video-synthetic.png` e `synthetic-quality-1080.png`. Dados temporários são removidos somente dentro da pasta temporária criada pelo próprio teste.

`FAROL_HEADED=1` mostra o navegador de testes. Esse modo ainda usa cartela, não seleciona nem autoriza captura do desktop. Não confundir com o launcher nativo. O launcher usa os mesmos assets, mas sua janela deve ser verificada separadamente.

Para ensaio prolongado sintético, use `FAROL_SOAK_SECONDS=1800`. São coletados heap JavaScript e contadores DOM via CDP a cada 30 s, com evidência de duração. Isso **não mede sozinho memória total do processo GPU/decoder**. Complementar com conjunto de PIDs do navegador dedicado e memória privada/working set via Monitor de Desempenho do Windows; não incluir o Edge pessoal. Registrar início/fim, aquecimento de 2 min, séries temporais e taxa de crescimento (MiB/min). Não concluir estabilidade de 30 min a partir de ensaio menor.

Para depurar ICE local: `node tools/diagnose-local.mjs`. Por padrão reproduz mDNS; `FAROL_DIAG_NO_MDNS=1` aplica a mesma opção do launcher. Saída só inclui estado, protocolo, contagens e métricas — sem SDP, IP, fingerprints, credenciais ou conteúdo de tela.

## Captura real — manual, não declarada validada

1. Abra `IniciarFarol.bat`. Confirme que o seletor inicial é cartela e que nada é capturado sem autorização.
2. Escolha um monitor SDR, confirme o consentimento do ensaio e selecione essa tela inteira no seletor Edge. Verifique que negar/cancelar mostra mensagem útil e não mantém captura.
3. Use uma cartela local ou documentos de teste sem dados pessoais no monitor atendido. Com dois monitores físicos, capture somente um e mantenha Farol no outro. Com um monitor, espere espelhamento se Farol estiver visível; isso não representa duas máquinas.
4. Conferir borda/indicador de compartilhamento do navegador, estado visível e Encerrar. Fechar a fonte, encerrar pelo navegador e fechar Farol devem liberar captura. Revogar a captura pelo sistema não exige interação com o aplicativo.
5. Testar escala Windows 100%, 125%, 150% e resoluções diferentes. A imagem deve manter proporção; 1:1 deve mapear cada pixel transmitido a um pixel físico, inclusive após mover a janela para tela com DPI diferente. Sem controle remoto para validar coordenadas nesta fase.
6. HDR/WCG ativo ou probe indisponível deve impedir captura e manter cartela disponível. Não mudar HDR durante a sessão neste incremento; parar e reabrir. Não validado tone mapping. Não chamar uma captura SDR de compatibilidade HDR.
7. Repetir stop durante solicitação, conexão, troca de perfil e tela cheia. Nenhuma captura pode reaparecer após stop, mesmo que o seletor responda atrasado. Verificar liberação dos recursos no Gerenciador de Tarefas.

## Legibilidade e imagem

Usar a cartela em 1:1 e o PNG sintético de qualidade em resolução original. Inspecionar separadamente texto preto/cinza e vermelho/azul/verde de 12/14/16 px, pontuação, separação `0O/1Il`, números de planilha e linhas de um pixel. Medir contraste de linhas, erro de crominância e PSNR/SSIM por região somente quando comparação alinhada e espaço de cor forem conhecidos. Não usar média global para aprovar textos. Capturar trechos após rolagem/arraste e nos intervalos de 0, 100, 250, 500 ms e 1 s após cessar movimento para medir recuperação da nitidez. Esse tempo não foi medido aqui.

O painel mostra FPS da fonte entregue ao WebRTC, não contador nativo de WGC/Desktop Duplication. Encoder/decoder e eficiência energética podem ser omitidos por política do runtime; mostrar "não exposto". Verificar GPU Video Encode/Decode por contadores/trace externos e comparar execução hardware/software controlada antes de afirmar aceleração. Registrar versão do driver, cópias GPU/CPU, uso de CPU/GPU, temperaturas e alimentação. O caminho zero-copy ainda não foi demonstrado.

`node tools/environment.mjs`, com `FAROL_PLAYWRIGHT` configurado, consulta ambiente nativo e GPU/capacidades via CDP, sem incluir endereços ICE ou caminhos do usuário. Salva `artifacts/environment.json`; capacidades habilitadas ainda não comprovam qual implementação codificou a sessão.

## Duas máquinas, redes e entrada — fases posteriores

Faltam uma segunda máquina Windows acessível para teste, serviço remoto implementado com identidade do técnico e HTTPS/WSS, servidor coturn público e acesso a dois links independentes. A presença de dois monitores nesta máquina não substitui dois computadores. Após implementar fase 03, registrar CPU/GPU/driver, Windows, resolução/DPI/HDR, versão do app/Chromium, codec/profile/chroma e dados nas duas pontas.

Matriz de rede sugerida (condições a aplicar num gateway de laboratório; sem alterar a rede operacional do usuário):

| Cenário | Banda vídeo | RTT | Jitter | Perda | Caminho |
|---|---:|---:|---:|---:|---|
| Referência | ≥30 Mbit/s | ≤30 ms | ≤2 ms | 0% | direto |
| Restrito | 5 Mbit/s | 30 ms | 5 ms | 0% | direto |
| Degradado | 2 Mbit/s | 80 ms | 20 ms | 1% | direto |
| Perda | 8 Mbit/s | 30 ms | 10 ms | 3% | direto |
| Relay | ≥30 Mbit/s | medir | medir | 0% | TURN forçado |
| Falha | cortar link/serviço | — | — | 100% | ambos |

Não usar limitação HTTP do DevTools como se limitasse necessariamente UDP WebRTC. Usar gateway Linux com `tc netem`/shaper, appliance ou ferramenta Windows adequada e confirmar por captura de pacotes/estatísticas, sem coletar conteúdo. Variar uma condição por vez e depois combinar. Observar adaptação nativa com histérese estável antes de adicionar um controlador próprio.

Para cada cenário: texto e planilha; rolagem; digitação/seleção; arraste/redimensionamento; tela estática; mudança de resolução/DPI; interrupção com teclas e mouse pressionados. Confirmar modo visualizar rejeitando input, revogação imediata e teclas/botões liberados nos dois lados. Não há módulo de input hoje para executar esses testes.

## Ação → retorno visual

RTT e soma encode+decode **não** medem a interação completa. Procedimento preferido: câmera externa ≥240 FPS enquadrando um gatilho de entrada com LED e a tela do técnico; a ação acende o LED e faz a aplicação de teste no atendido mudar uma região de alto contraste. Contar quadros entre LED e mudança visível recebida. Pelo menos 100 ações com pausas aleatórias por cenário, incluindo clique/digitação/rolagem. Registrar FPS real/exposição/rolling shutter e posição da região; reportar mediana, p95, máximo e quantização conservadora ±2 quadros (±8,33 ms a 240 FPS), além de incertezas do gatilho/scanout. A margem final pode ser maior e deve ser calibrada. Captura só por timestamp de software exige sincronização e incerteza de relógios demonstradas.

Meta a avaliar em hardware de referência: ação→visual p95 ≤150 ms, RTT ≤30 ms, banda suficiente e hardware ativo comprovado, 1080p60 em movimento. Não medida nesta entrega. Faltam segunda máquina, canal de entrada implementado e câmera/gatilho apropriados. Não equiparar o loopback sintético a essa aprovação.
