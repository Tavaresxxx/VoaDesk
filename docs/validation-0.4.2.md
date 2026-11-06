# VoaDesk 0.4.2 — solicitação, espera e encerramento

## Comportamento

- Verificar código envia a solicitação de atendimento e abre uma tela que ocupa toda a janela, com símbolo VoaDesk e animação de espera. Nenhum acesso é concedido antes da decisão do cliente.
- Cancelar durante a solicitação aguarda a resposta e encerra a sessão criada, inclusive quando essa resposta chega atrasada. Recusa e expiração retornam à tela de acesso com mensagem.
- Encerrar interrompe vídeo e entrada local imediatamente, confirma a revogação no servidor e retorna à tela de acesso. Se a confirmação falhar, o botão permite tentar novamente; o aplicativo não informa revogação confirmada sem resposta.
- O cliente Windows usa uma janela de 400 × 250 pixels em escala de 100%, com logo, código, atualização e mensagens breves. Clicar no código permite copiá-lo. Consentimento e encerramento aparecem quando há atendimento; a janela volta ao tamanho compacto ao terminar.
- Reconexão e inicialização com Windows continuam disponíveis pelo menu da bandeja. A identidade e as preferências existentes são preservadas.
- O diagnóstico continua disponível dentro da tela de atendimento. O botão Tela cheia pode usar também o modo de tela cheia do navegador.

## Verificações locais

Build Windows e 43 testes Node passaram. Também passaram os ensaios abaixo:

- `tools/client-smoke.mjs`: cliente nativo compacto, código preservado após reabertura, envio de solicitação por Verificar código, espera em desktop e 390 pixels, cancelamento pendente, resposta atrasada, recusa, expiração, falha no encerramento com nova tentativa e agenda de clientes.
- `tools/native-session-smoke.mjs`: abertura a partir da bandeja, consentimento explícito no cliente Windows, encerramento confirmado pela API e retorno ao tamanho compacto.
- `tools/support-smoke.mjs`: H.264 com fonte sintética 1080p entre duas páginas locais, diagnóstico, permissões, comandos para fila de teste, liberação e encerramento. Resposta de estado atrasada não restaura vídeo após encerrar.
- `tools/native-bridge-smoke.mjs` e `tools/native-race-smoke.mjs`: entrega para um destino de entrada de teste, liberação de teclas/botões e rejeição de estado anterior à revogação, sem injetar comandos no Windows.
- `tools/update-ui-smoke.mjs`: tela de atualização com código oculto e chave de assinatura temporária, sem acesso à chave operacional nem execução do instalador.
- `tools/verify-installation.ps1`: integridade dos pacotes, endpoint HTTPS e ausência de dados/credenciais no pacote do técnico.

## Distribuição e limites

O Render executa o serviço de sinalização. Sua implantação não substitui os aplicativos Windows já copiados para outros computadores. Use o novo `VoaDeskCliente.exe` e extraia o novo `VoaDeskTecnico.zip` da pasta instalação; preserve qualquer configuração e histórico existentes. Executáveis, perfis, identidades, capturas de tela e dados operacionais ficam fora do commit.

O teste de vídeo usa uma fonte sintética em um único computador. Não comprova captura real, controle de outro computador ou conectividade entre redes diferentes. A prévia continua sem TURN e com presenças e sessões do servidor em memória; não representa histórico permanente de clientes.
