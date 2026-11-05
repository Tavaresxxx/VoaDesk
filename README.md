# VoaDesk

Aplicativo Windows de suporte remoto em desenvolvimento. A prévia 0.2 inclui **cliente compacto com código temporário reconhecido no painel do técnico**, identidade visual preta/branca/azul usando a logo fornecida e laboratório H.264 local.

Serviço de códigos publicado em **https://voadesk.onrender.com** no plano Free. O cliente compilado em `dist/VoaDeskCliente.exe` já aponta para esse endereço, e o principal neste workspace está configurado para usá-lo. A implantação e o autoteste HTTP interno do Render passaram; o teste HTTPS externo/entre duas máquinas não pôde ser executado pela rede restrita deste ambiente.

**O pareamento de códigos funciona; transmissão e controle entre computadores ainda não estão implementados. Verificar um código não inicia captura nem autoriza acesso remoto.**

## Computador do cliente

Envie apenas **`dist/VoaDeskCliente.exe`**. Não precisa de Node.js, Edge, pasta do projeto, instalação, permissões de administrador ou arquivos de imagem. Requer Windows 11 x64 com .NET Framework 4.8, normalmente incluído no Windows.

Ao abrir, aparece uma janela compacta de aproximadamente 420 × 338 pixels lógicos: logo, código de 12 caracteres, validade de cinco minutos, copiar e novo código. A logo está incorporada ao arquivo. O ícone contém somente o símbolo V original, com base branca para manter o contraste na barra de tarefas.

O código é emitido pelo servidor, expira, só pode ser verificado uma vez e é revogado ao fechar a janela quando a rede permite; a expiração cobre falhas de revogação. Sem serviço disponível, o cliente mostra **Sem conexão**, nunca um código fictício.

O endereço do serviço é incorporado durante a compilação. O padrão é `https://voadesk.onrender.com`. Para desenvolvimento exclusivamente local, use `-PairingUrl http://127.0.0.1:47832` e o serviço local com o painel aberto **na mesma máquina**. HTTP externo e certificados inválidos são recusados. Não há credencial de operador no cliente.

## Computador do técnico

Abra **`IniciarVoaDesk.bat`** ou `dist/VoaDesk.exe`. Requer Node.js 22+, Edge e .NET Framework 4.x. Na primeira execução a partir dos fontes, o `.bat` compila os componentes nativos. A janela principal oferece **Acessar computador → Verificar código** e mantém o laboratório de vídeo abaixo.

Sem configuração remota, inicia um serviço de códigos somente em `127.0.0.1:47832`; esse modo exige um cliente compilado para o endpoint local. A porta é fechada ao encerrar o host; o host encerra cerca de 90–95 segundos após perder o heartbeat da janela. O launcher impede duas instâncias principais pelo mesmo usuário. O perfil Edge do aplicativo é separado; dados e histórico anteriores são preservados. Pacotes para terceiros não incluem a credencial privada do técnico: outro computador de técnico requer sua própria configuração; o principal neste workspace já foi configurado.

No modo online, o launcher lê `.runtime/operator-settings.json`, restrito ao usuário Windows e SYSTEM e excluído do Git/pacotes. Prefere DPAPI; se DPAPI estiver indisponível, a configuração fica protegida por ACL Windows. A configuração do operador nunca deve ser enviada ao cliente ou copiada para GitHub. Autenticação individual do técnico por conta ainda é futura; a credencial atual autentica apenas o operador do serviço de códigos.

## Compilar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1
# Para incorporar um serviço publicado ao cliente:
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1 -PairingUrl https://SEU-SERVICO.onrender.com
```

A imagem original `Logo.png` é preservada. Se estiver ausente num clone Git, o build a restaura de `assets/Logo.png.base64`; logo e ícone de tamanhos 16 a 256 px são derivados por recorte/conversão, preservando o desenho fornecido.

Para gerar os pacotes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1
```

`dist/VoaDesk-0.2.0-windows-x64.zip` contém o aplicativo principal, cliente, fontes e documentação. `dist/VoaDeskCliente-0.2.0.zip` contém somente o cliente e instruções. Ambos excluem perfil de navegador, histórico e credenciais. São binários de prévia sem assinatura digital. O endereço incorporado depende do parâmetro de build; conferir a configuração antes de enviar a terceiros.

## Serviço de códigos no Render

Repositório autorizado: https://github.com/Tavaresxxx/VoaDesk (privado). Serviço existente **VoaDesk**, Node **Free**, uma instância, sem disco/banco/worker. Comandos atuais do Render: `yarn install` / `yarn start`. `VOADESK_MODE=pairing` seleciona o serviço, enquanto o desktop preserva sua inicialização Windows. `VOADESK_OPERATOR_TOKEN` foi configurado pelo plugin, sem segredo no Git; `PORT` vem do Render. `VOADESK_TRUST_PROXY=true` é usado atrás do proxy do provedor. `VOADESK_STARTUP_SELF_TEST=true` verifica os fluxos HTTP internos uma vez por inicialização, revoga os dados de teste e registra somente estados/códigos HTTP, sem segredos. Health: `/health`.

O serviço recebe somente códigos e estados; não recebe vídeo, teclas ou tela. Registros são efêmeros em memória: restart/redeploy invalida os códigos; peça um novo código. O plano Free pode suspender após inatividade e demorar para iniciar. Não há TURN ou promessa de gratuidade da retransmissão de vídeo. Ver [configuração e limites](docs/voadesk-0.2.md).

## Verificar

```powershell
node --test tests/core.test.mjs tests/host.test.mjs tests/pairing.test.mjs tests/server-start.test.mjs
```

Teste visual/integração usa uma instalação de Playwright informada por `FAROL_PLAYWRIGHT`; esse nome de variável preserva compatibilidade com o laboratório inicial. `tools/client-smoke.mjs` verifica o cliente nativo e o fluxo do painel usando servidor local. As imagens do cliente têm código substituído por `XXXX XXXX XXXX`, nunca o segredo ativo. `tools/video-smoke.mjs` verifica o caminho H.264 após a mudança visual; não depende do servidor remoto.

Antes dos testes nativos, execute `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-test-tools.ps1`. O teste `tools/window-smoke.mjs` consulta as propriedades da janela principal criada pelo próprio teste; exige que esse contexto consiga abrir Edge com janela. Neste executor isso não foi possível; o resultado ficou explicitamente não confirmado, sem desativar o sandbox do aplicativo.

- [Entrega 0.2, implantação e evidências](docs/voadesk-0.2.md)
- [Arquitetura inicial e fontes](docs/architecture.md)
- [Protocolo e evolução de segurança](docs/security-and-next.md)
- [Desempenho do laboratório inicial](docs/performance.md)
- [Procedimentos de vídeo e latência](docs/validation.md)

O nome Farol em arquivos técnicos/histórico representa a primeira prova de vídeo. A marca ativa do aplicativo é VoaDesk. Não há acesso oculto, input, transferência, áudio, autostart, serviço Windows, controle de UAC ou desktop seguro.
