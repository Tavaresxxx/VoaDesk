# VoaDesk 0.4.1 — prévia para teste em rede local

Atendimento Windows autorizado pelo cliente, com sinalização HTTPS e vídeo H.264/WebRTC direto entre os participantes. Esta versão prepara o teste manual entre **duas máquinas na mesma rede local**, ambas com internet. A conexão real entre os dois Windows precisa ser confirmada pelo procedimento abaixo; testes de pareamento ou de vídeo sintético não a substituem.

O serviço de sinalização é `https://voadesk.onrender.com`. Não há TURN/STUN nesta prévia nem garantia de conexão entre redes distintas. O firewall e a topologia da LAN podem impedir a conexão direta. Não desative o firewall, Defender, UAC ou o sandbox do Edge para testar.

## Arquivos para usar

Execute `npm run package:installation` para gerar exatamente dois arquivos locais em `instalação/`:

- `VoaDeskCliente.exe`: entregue ao computador atendido. Contém o endpoint HTTPS e não contém credencial do técnico. Não requer Node.js instalado.
- `VoaDeskTecnico.zip`: extraia a pasta completa no computador do suporte e execute `AbrirTecnico.bat`. O Node.js portátil e seus avisos de licença estão incluídos.

Os dois computadores precisam de Windows 11 x64, Edge e .NET Framework 4.8. O atendido precisa de um único monitor SDR. O técnico requer a credencial do operador provisionada na conta Windows; ela não faz parte dos arquivos distribuídos. O launcher lê primeiro a configuração privada do projeto e, quando ausente, `%LOCALAPPDATA%/VoaDesk/operator-settings.json`. Em outra conta de técnico é necessário provisionamento autorizado.

Não mova somente o executável do técnico para fora da pasta extraída. Não copie `.runtime`, identidades ou credenciais para os pacotes. `dist`, `.cache` e `instalação` ficam fora do repositório.

## Teste entre duas máquinas

1. Deixe as duas máquinas na mesma LAN com acesso à internet. Extraia o técnico e abra `AbrirTecnico.bat`.
2. No computador atendido, abra `VoaDeskCliente.exe` e envie seu código ao técnico.
3. No técnico, informe o código e clique **Solicitar atendimento ao cliente**. Verificar código apenas identifica presença.
4. No atendido, confira a solicitação e escolha **Permitir visualizar**. Na janela Edge, clique em escolher tela e selecione o monitor inteiro.
5. Confirme que o técnico enxerga a imagem real da outra máquina e que texto/cliques não são aplicados no modo visualizar.
6. Encerre e faça uma nova solicitação. Autorize **Permitir controle**, selecione o monitor e teste texto com acentos, mouse e rolagem em um aplicativo de teste sem dados reais.
7. Retire controle com **Permitir visualizar** e confirme a liberação das teclas/botões. Encerre no cliente e confira a parada nas duas pontas.
8. Desconecte a rede do atendido durante uma sessão de teste; confirme a interrupção e solicite nova autorização ao reconectar.

Anote versão, Windows/Edge, quantidade de monitores, rede, resultado e tempos observados. Se a conexão falhar, registre o diagnóstico; não trate autorização, SDP ou código verificado como prova de imagem/controle funcionais.

## Segurança e dados

O código identifica o cliente e não concede acesso. A sessão exige credencial do técnico e consentimento do atendido; o cookie de captura é HttpOnly/SameSite Strict e Secure em HTTPS. Comandos são vinculados à revisão da permissão. Revogar presença ou trocar sua credencial de sessão encerra a autorização. Fila, tamanho, prazo de upload e frequência de requisições têm limites; a ação de encerrar permanece disponível com a cota esgotada.

No Render sem disco, o registro guarda somente presença em memória e deriva o código por HMAC a partir da identidade privada do dispositivo e da chave já configurada do servidor. Reinícios encerram sessões e exigem reconexão. A mesma identidade e a mesma chave recuperam o código; trocar a chave altera os códigos derivados. Isso **não é banco persistente, histórico no servidor nem reserva global entre servidores independentes**. O modo local continua usando `.runtime/pairing-devices.json`, preservando os códigos existentes.

Identidade do cliente: `%LOCALAPPDATA%/VoaDesk/client`, por endpoint, com DPAPI quando disponível e ACL restrita. Agenda e histórico do técnico ficam locais. Não apagar ou compartilhar identidades. A atualização mantém assinatura de manifesto, verificação de tamanho/hash e cópia anterior; não há atualização remota nova configurada por este processo.

O serviço de sinalização é uma fronteira de confiança. WebRTC usa DTLS-SRTP/SCTP, mas não foi implementada autenticação externa do técnico por conta/OIDC nem verificação independente do transcript contra o próprio servidor. Não anunciar E2EE autenticada ou identidade pessoal verificada. A assinatura do manifesto não equivale a Authenticode ou reputação no SmartScreen.

## Desenvolvimento e QA

```powershell
npm test
npm run test:security
npm run test:load
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-test-tools.ps1
node tools/native-race-smoke.mjs
node tools/native-features-smoke.mjs
# Aponte FAROL_PLAYWRIGHT para uma instalação local do Playwright.
node tools/support-smoke.mjs
```

`npm start` mantém o modo localhost de desenvolvimento. O ZIP do técnico inicia explicitamente com `--online`. O servidor Render usa `VOADESK_MODE=pairing`, a credencial existente em `VOADESK_OPERATOR_TOKEN` e a origem HTTPS de `VOADESK_PUBLIC_ORIGIN` ou `RENDER_EXTERNAL_URL`. Não há novas despesas ou dependências npm em runtime.

Depois do deploy Live, os testes autorizados de produção usam a credencial local sem imprimi-la:

```powershell
node tools/production-http-qa.mjs
node tools/support-smoke.mjs --production
node tools/native-bridge-smoke.mjs --production
```

Esses testes criam identidades descartáveis, usam uma fonte de vídeo sintética e substituem SendInput por um coletor. Eles verificam o HTTPS público e o caminho de sinalização/entrada sem capturar o desktop ou injetar teclas reais. Relatórios ficam em `artifacts/production-qa`; a homologação entre máquinas permanece separada.

- [Segurança e carga local anteriores](docs/security-validation-local.md)
- [Entrega localhost 0.4 e seus limites históricos](docs/voadesk-0.4-local.md)
- [Validação manual anterior](docs/validation-0.4.md)
- [Arquitetura e próximos requisitos](docs/security-and-next.md)

MIT cobre o código do projeto; Windows, Edge, Node.js e codecs mantêm seus próprios termos e licenças.
