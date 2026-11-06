# Técnico Windows 0.6: arquitetura e validação

## Decisão

WinForms incorpora a interface existente pelo WebView2, mantendo o servidor Node, a sinalização, H.264/WebRTC, a captura do cliente e o protocolo de arquivos. Electron também reaproveitaria a interface, mas traria outra distribuição Chromium/Node e uma integração diferente. Reescrever os controles em WinForms aumentaria o risco sem necessidade. WebView2 reaproveita o runtime Evergreen mantido pela Microsoft, disponível neste ambiente em 157.0.4341.42; SDK fixado em 1.0.4314.35, obtido no NuGet oficial e conferido por SHA-256 e assinatura Microsoft.

A janela não abre Edge para o técnico. O cliente continua portátil com sua captura existente. Não foram adicionados login em nuvem, atendimento simultâneo ou acesso sem consentimento.

## Inicialização e encerramento

O EXE inicia Node sem console, com stdin/stdout privados. O host confirma sua origem loopback e fornece o cookie de sessão por esse pipe; o C# injeta o cookie HttpOnly no controle e navega à raiz, sem credencial na URL. A credencial do operador fica na configuração protegida existente e no ambiente do auxiliar, sem ir ao renderer.

O mutex mantém a identidade de instância do launcher anterior. O evento de reabertura traz a janela existente para frente. A interface usa porta dinâmica; a sinalização local retém 47832 para não trocar o endpoint associado à identidade existente. Ocupação da porta gera orientação clara, sem matar outro processo.

Ao fechar, a página libera entrada, cancela RPCs/transferências e solicita encerramento. O processo host também espera uma solicitação de sessão pendente e encerra o atendimento antes de fechar sockets. EOF do pipe do dono dispara o mesmo fluxo. O aplicativo aguarda até 12 s e, se necessário, encerra somente o Process que iniciou. Não enumera nem mata processos por nome. O cliente aberto por Receber acesso continua sendo um aplicativo independente.

## Segurança e integração

Não há host objects nem canal genérico JS/nativo. Navegações e frames fora da origem loopback são recusados; novas janelas são bloqueadas. Permissões de câmera, microfone, geolocalização etc. são recusadas; operações de arquivos mantêm os seletores/permissões do runtime. CSP e verificações de Host/origem/autenticação continuam no servidor. A única chamada de script de encerramento é fixa e restrita à origem local.

O evento de fullscreen muda a borda e os limites da janela e restaura o estado anterior. Atalhos próprios do navegador são desativados; os handlers existentes de texto, teclas e foco permanecem. Não há tentativa de capturar CTRL+ALT+DEL, UAC ou área segura. Seletores de upload e File System Access são executados pelo WebView2; nenhum caminho arbitrário é exposto por uma ponte nativa do técnico.

## Preservação e distribuição

Não houve migração de JSON, redefinição de identidades, troca de códigos ou alteração de credenciais. A agenda/histórico mantêm seus caminhos; o perfil WebView2 é novo e o perfil Edge antigo permanece. O ZIP contém aplicativo, DLLs/loader x64, Node portátil, fontes de runtime e licenças, sem `.runtime`, `.cache` ou evidências.

O runtime WebView2 Evergreen é um pré-requisito detectado. Ausência do runtime ou de arquivos do pacote gera uma mensagem na janela. Não é usado o Edge Stable como runtime substituto. Abrir o EXE distribuído usa o modo online indicado pelo arquivo público `modo-online.flag`; `AbrirTecnicoLocal.bat` usa `--local`.

## Evidência e falhas

O teste nativo usa WinForms/WebView2 reais e vídeo sintético 1280×720 H.264 de uma ponte nativa com SendInput substituído por coletor. Confere recusa, autorização, fullscreen, dois monitores, zoom, acentos, arquivos com conteúdo comparado, fechamento durante transferência, término do auxiliar e reabertura com agenda/código preservados. Não injeta entrada no Windows nem captura o desktop real.

A primeira falha de acentos veio da codificação OEM do programa de QA; seus pipes foram definidos como UTF-8. O teste dos seletores reais abriu a janela de salvamento, mas a automação não confirmou o arquivo no caminho esperado e terminou com ENOENT. Esse resultado está preservado em `artifacts/native-technician/report-pickers-attempt.json`; não equivale a teste completo dos seletores reais. O teste automatizado usa o writer real no perfil isolado do WebView2 e a seleção de upload via CDP, e registra essa distinção.

A regressão de upload fragmentado reproduziu ECONNRESET, inclusive antes de começar a resposta do servidor. A causa estava no encerramento HTTP após exceder o limite, deixando enquadramento chunked não consumido no socket Windows. O parser agora descarta no máximo 64 KiB por até 100 ms antes da rejeição, sem ampliar o buffer JSON, remover o prazo absoluto ou aceitar o corpo excedido. O teste continua exigindo HTTP 413. Tentativas anteriores e novas medições ficam em `artifacts/native-technician/fragmented-upload*.json`; o teste de upload lento continua exigindo HTTP 408 dentro do prazo.

A validação entre computadores, captura/entrada reais, seletores completos em outra instalação, DPI/resoluções variados, arquivos realmente grandes e desempenho continuam separados da integração sintética. A implantação só pode ser declarada depois de revisão final Live e verificação HTTP; não prova funcionamento do aplicativo instalado entre máquinas.

## Referências

- [WinForms/WebView2](https://learn.microsoft.com/microsoft-edge/webview2/get-started/winforms)
- [Distribuição e runtime](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)
- [Segurança do host](https://learn.microsoft.com/microsoft-edge/webview2/concepts/security)
- [SDK NuGet](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4314.35)
