# Segurança e carga local — 06/11/2026

Resultado: **37 testes Node aprovados, compilação Windows aprovada e ensaios locais de segurança/carga aprovados nos casos descritos**. Foram acrescentados 11 testes de regressão de segurança. Isso não constitui homologação de acesso remoto pela internet nem garantia de ausência de vulnerabilidades.

Os ensaios criaram servidores em portas aleatórias de `127.0.0.1`, registros e identidades descartáveis no diretório temporário. Nenhum teste de carga aponta para um serviço já existente: `tools/security-load.mjs` cria os próprios alvos e não aceita uma URL externa. Dados operacionais, identidades dos clientes, configurações de inicialização e credenciais existentes não foram alterados. Executáveis em `dist/` foram recompilados localmente. Não houve commit, push ou implantação no Render.

## Falhas corrigidas e reforços

| Área | Risco encontrado | Comportamento atual e verificação |
|---|---|---|
| Revogação de identidade | Uma presença substituída do mesmo dispositivo podia continuar vinculada à sessão autorizada pelo ID persistente. | A sessão fica vinculada também à presença autenticada. Revogar ou substituir essa presença encerra a sessão, limpa comandos e invalida tickets. Teste HTTP e de estado aprovado. |
| Resposta nativa atrasada | Uma consulta iniciada antes de retirar o controle podia chegar depois e reativar a entrada. | O cliente mantém consentimento local vinculado à sessão e descarta respostas de outra geração/token ou com mais de 1,2 s. O watchdog exige nova autorização local para voltar ao controle. Um proxy descartável atrasou uma resposta contendo uma tecla; a revogação foi respeitada, sem injetar entrada real no Windows. |
| Comandos de autorização anterior | Um comando em trânsito podia chegar após retirar e conceder controle novamente. | Mensagens incluem a revisão da permissão; o servidor recusa comandos de revisões anteriores. A liberação de teclas continua permitida. Teste de corpo fragmentado atravessando duas mudanças de permissão aprovado. |
| Saturação de sessões | As rotas v3 não tinham orçamento geral por participante autenticado. | Limite de 1.200 requisições por 10 s e capacidade autenticada, armazenada como hash. Excessos retornam 429. Encerrar pelo operador, cliente ou captura continua disponível sem depender dessa cota. Testes de saturação e encerramento aprovados. |
| Corpos grandes/lentos | Leitura repetida de strings não preservava necessariamente UTF-8 dividido entre chunks, e uploads podiam ocupar conexões. | Leitura comum em bytes: até 110.000 bytes para sinalização e até 1–2 KiB nas demais rotas que recebem JSON, prazo absoluto de 5 s, resposta 413/408 com fechamento. JSON deve ser objeto. Testes de fragmentação, limite por chunks, interrupção e envio lento aprovados. |
| Fila de entrada | Orientação podia acrescentar um comando a uma fila já com 128 itens. | Overflow encerra o controle e limpa a fila. Movimentos continuam sendo coalescidos. Teste aprovado. |
| Fronteira HTTP | As APIs nativas v3 não conferiam Host como a página de captura. Algumas rotas liam o corpo antes de conferir o papel autenticado. | Host loopback exato e autenticação dos papéis antes da leitura nas rotas protegidas. Origem externa, credencial incorreta e tentativa de acesso a arquivos internos foram recusadas nos testes. |
| Downloads/atualização | Downloads carregavam o executável inteiro em memória; a consulta nativa de manifesto verificava o tamanho após o buffering HTTP. | Downloads usam streams. A consulta do manifesto lê os headers primeiro e limita o corpo a 12.000 bytes durante a leitura. Manifestos grandes com Content-Length e chunked foram recusados sem esperar o fim da transferência. Assinatura, expiração, adulteração e substituição com cópia anterior também foram verificadas. |

O limite de requisições é por capacidade autenticada e janela fixa; não representa proteção completa contra DDoS. Os tetos existentes de conexões foram mantidos: 512 no serviço e 24 no painel. Cada socket agora também tem limite de 1.000 requisições antes da renovação.

## Quanto suportou no ensaio HTTP

Ensaio final iniciado em `2026-11-06T13:48:34.497Z`, Windows x64, Intel Core i5-1135G7, 8 CPUs lógicas, 16 GiB RAM, Node 24.21.0. Gerador e aplicação usaram processos separados na mesma máquina. Houve trabalho de compilação e integração em paralelo nos primeiros estágios; outros programas, energia e temperatura não foram controlados. Os resultados são observações deste computador, não uma capacidade garantida de produção.

| Alvo/cenário | Concorrência | Respostas/s | p95 HTTP | Resultado |
|---|---:|---:|---:|---|
| `/health`, 3 s | 1 | 3.479 | 0,50 ms | Sem erros |
| `/health`, 3 s | 8 | 4.332 | 3,37 ms | Sem erros |
| `/health`, 3 s | 32 | 4.595 | 11,53 ms | Sem erros |
| `/health`, 3 s | 128 | 3.615 | 70,47 ms | Sem erros |
| `/health`, 3 s | 384 | 3.412 | 144,65 ms | Sem erros |
| `/health`, acima do teto, 3 s | 640 | 1.908 | 602,75 ms | 1.531 conexões recusadas/resetadas; recuperação posterior aprovada |
| Painel autenticado, 3 s | 16 | 4.602 | 5,88 ms | Sem erros |
| Painel acima do teto, 3 s | 48 | 1.531 | 23,27 ms | 4.584 conexões recusadas/resetadas |
| Sessão autenticada, 3 s | 32 | 4.375 | 12,00 ms | 1.200 respostas 200 e 11.978 respostas 429; sem erros de transporte |
| `/health`, 30 s contínuos | 32 | 5.082 | 10,97 ms | 152.481 respostas 200, sem erros |
| `/health` durante 128 uploads incompletos | 8 | 4.850 | 2,86 ms | Sem erros; todos os uploads receberam 408 |
| `/health` depois dos uploads | 8 | 4.782 | 2,80 ms | Sem erros |

Os 128 uploads incompletos foram encerrados pelo prazo de leitura de 5 s; a etapa combinada de uploads e health terminou em 5,52 s. O teste individual com envio contínuo de bytes confirmou resposta 408 em cerca de 5,03 s.

O maior RSS amostrado do processo que continha os dois servidores foi **83,68 MiB**. Esse número exclui o gerador e o navegador; não é memória total do produto nem comprovação de ausência de vazamento. A etapa contínua durou 30 s, não 30 minutos. Os casos acima do teto tiveram recusas esperadas e não devem ser descritos como atendimento sem falhas a 640/48 conexões.

## Vídeo e componentes nativos

- Edge 157.0.4341.42: duas páginas locais negociaram H.264 com fonte canvas 1920 × 1080. Houve vídeo, texto Unicode no DataChannel, orientação, bloqueio em modo visualizar e encerramento nas duas pontas. A última amostra exibiu aproximadamente 30 FPS apresentados. Não houve captura real do desktop nem medição de latência física.
- A ponte HTTP → cliente nativo entregou Unicode ao coletor de teste e liberou teclas/botões. O coletor substituiu SendInput; nenhuma tecla ou clique foi injetado no sistema operacional.
- O teste com resposta atrasada e retirada de controle passou. O teste de manifesto verificou assinatura RSA, expiração, adulteração e rejeição antecipada de corpos grandes. A substituição de arquivo foi feita em fixture, preservando `.previous`; o instalador completo não foi executado.

## Reproduzir

```powershell
npm test
npm run test:security
npm run test:load
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-test-tools.ps1
node tools/native-race-smoke.mjs
node tools/native-features-smoke.mjs
# Configure FAROL_PLAYWRIGHT com o caminho de uma instalação local do Playwright.
node tools/support-smoke.mjs
```

O ensaio desta revisão instalou a ferramenta de teste Playwright somente em `.cache/security-tools`; ela não foi adicionada às dependências do aplicativo.

Evidências desta rodada:

- [Carga final e amostras do processo](../artifacts/security-local/load-2026-11-06T13-48-34-497Z.json)
- [Revogação durante resposta nativa atrasada](../artifacts/security-local/native-race.json)
- [Atualização e entrada nativa em fixtures](../artifacts/security-local/native-features.json)
- [H.264 e DataChannel entre páginas locais](../artifacts/security-local/support-smoke.json)
- [Testes de regressão de segurança](../tests/security.test.mjs)

Continuam pendentes: ensaio prolongado de memória e mídia, captura e controle reais entre dois computadores, congestionamento de rede, NAT/TURN, identidade externa de técnico, validação da distribuição/Authenticode e segurança da infraestrutura pública. Pareamento, testes HTTP e fonte sintética não demonstram esses requisitos.
