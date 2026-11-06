# Validação local do VoaDesk 0.6

## Aprovado

- Compilação Windows do cliente portátil e da janela WinForms/WebView2.
- `npm test`: 50/50, incluindo origem/autenticação, consentimento, EOF do processo dono, encerramento durante solicitação pendente e mensagem de servidor indisponível.
- `native-technician-smoke.mjs`: WebView2 real 157, H.264 sintético, busca/seleção de cliente salvo, recusa, consentimento, duas seleções de monitor, fullscreen nativo, zoom, acentos até coletor, arquivos nos dois sentidos com conteúdo conferido, fechamento durante transferência, limpeza do parcial, término do Node próprio e reabertura com agenda/código preservados.
- O mesmo teste usando o pacote extraído confirmou o Node portátil, com PATH de desenvolvimento removido do auxiliar. Não usa Node instalado no computador para servir o aplicativo empacotado.
- Testes nativos de resposta atrasada, liberação de entrada, Unicode, coordenadas negativas, assinatura de atualização, adulteração/expiração, substituição atômica e preservação da versão anterior.
- Cliente portátil: código estável ao reabrir; estados/agenda e ações de atendimento; atualização: código oculto até atualização autorizada, com chave de teste e sem executar o instalador real.
- Acessibilidade automatizada: cinco larguras e dez estados, incluindo compatibilidade de captura do cliente legado, sem violações detectadas nos critérios axe configurados.
- Regressão fragmentada: 300 iterações de texto UTF-8 fragmentado e upload excedido, exigindo respectivamente 200 e 413, após a correção de descarte limitado. A falha anterior ECONNRESET foi reproduzida e registrada; não foi ignorada na asserção.
- Carga HTTP existente: saúde e recuperação, 128 uploads lentos encerrados por prazo. Os resets nos estágios deliberadamente acima dos limites de conexões continuam registrados, e não são capacidade de sessões de vídeo.
- Pacote: manifesto/SHA-256, dependências WebView2/Node, licenças, versão/endpoint, correspondência entre EXEs e ausência de arquivos privados/credencial do operador.

## Falhas registradas e limites

- A primeira execução de QA enviou acentos com codificação OEM no pipe do programa de testes. O fixture passou a usar UTF-8; a implementação de texto remoto foi preservada.
- Um ensaio inicial do cliente não tinha FAROL_PLAYWRIGHT configurado; foi reexecutado com a instalação local de QA. O fixture de atualização precisava incluir DesktopBridge.cs e usar uma versão futura em seu manifesto de teste; ambos foram corrigidos, sem mudar a chave operacional nem enfraquecer verificações.
- O ensaio com seletor real abriu a janela de salvamento, mas a automação não confirmou o arquivo no destino pedido e registrou ENOENT. Não foi declarado aprovado. O teste de transferência automatizado usa File System Access com writer real em perfil descartável e upload via CDP; não comprova a interação completa com os dois seletores nativos.
- Não foram validados captura real do desktop, injeção real de mouse/teclado, outro Windows, redes distintas, arquivo fisicamente multigigabyte, DPI heterogêneo, atualização completa ou desempenho. Não há nova promessa de aceleração, FPS ou latência.
- CTRL+ALT+DEL, UAC e área segura continuam limitados. A interface explica isso; não foi instalado serviço nem alterada política Windows.

Os relatórios detalhados ficam em `artifacts/` local e são excluídos do GitHub e dos pacotes. A implantação é uma verificação separada, registrada após o código chegar a Live; não valida controle remoto entre computadores.
