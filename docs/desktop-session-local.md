# Captura nativa, monitores e arquivos — verificação local

O cliente agora oferece **Aceitar conexão** e **Encerrar / recusar atendimento**. Aceitar concede controle, acesso aos monitores e transferência de arquivos. Não há opção de somente visualizar ou seletor de tela do navegador no fluxo novo. O técnico entra em tela cheia ao solicitar acesso, aproveitando o gesto exigido pelo navegador; a sessão usa toda a janela se a API for recusada, e a barra mantém o botão Tela cheia.

`native/DesktopBridge.cs` expõe somente loopback e reaproveita a sinalização autenticada. A captura usa o identificador Win32 do monitor, o mesmo retângulo usado pelo SendInput com MOUSEEVENTF_VIRTUALDESK. A geração de seleção impede entrada atrasada de um monitor anterior. A entrada é suspensa durante a troca; duas apresentações de vídeo liberam a interação. O cliente continua podendo encerrar a qualquer momento.

O canal `files` usa confirmação por bloco de 16 KiB. Leitura e escrita são sequenciais; tamanho total não define a memória alocada. O técnico navega nas unidades/pastas do cliente; recebe por um seletor de salvamento do Edge e envia à pasta aberta ou Downloads/VoaDesk. Cancelar/encerrar remove o parcial do cliente; falha no técnico aborta o writer do navegador. Arquivos existentes no cliente não são sobrescritos. Uma transferência simultânea por sessão, sem retomada após queda de conexão.

## Evidência

`artifacts/desktop-local/desktop-session.json` e os PNGs ao lado são produzidos por `node tools/desktop-session-smoke.mjs`, depois de `tools/build-test-tools.ps1`.

O teste conecta duas páginas Edge a serviços efêmeros em localhost, inicia a ponte nativa real com uma fonte de pixels **sintética** e substitui SendInput por um coletor. Verifica vídeo H.264, enumeração e troca dos dois monitores disponíveis neste ambiente, eventos até o componente nativo, tela cheia automática, zoom, transferência nos dois sentidos, comparação do conteúdo, preservação de destino existente, cancelamento, tamanho declarado de 5 GiB sem alocação desse volume, recusa sem cookie/origem e descarte do vídeo ao encerrar.

O teste não prova captura real dos dois desktops, injeção no Windows, rede entre computadores, transferência física de 5 GiB ou funcionamento no servidor público. A revisão geométrica nativa inclui monitores com coordenadas negativas. Os testes anteriores de revogação e resposta atrasada continuam usando um coletor de entrada.

## Limites para homologação

- Confirmar imagem, posição do mouse e entrada reais entre dois Windows, com escalas DPI e resoluções diferentes.
- Testar arquivo realmente grande, espaço insuficiente e queda de rede. Não há limite fixo em MB/GB, mas há espaço livre, duração da sessão e limites do sistema de arquivos.
- CTRL+ALT+DEL exige serviço ou aplicativo UIAccess; o botão explica a indisponibilidade na versão portátil. Não instala serviço nem altera políticas Windows. Gerenciador de Tarefas é um atalho separado.
- Captura nativa por GDI/JPEG/canvas em SDR, com alvo de até 30 capturas/s e uma solicitação de quadro por vez. A captura e a codificação JPEG rodam fora da fila da janela do cliente. O desempenho em dois computadores permanece pendente de medição.
- O EXE e o ZIP em `instalação/` foram atualizados para teste, com os anteriores preservados em `.cache/installation-before-test-*`. A pasta extraída do técnico também recebeu os arquivos novos, preservando `.runtime` e dados locais.
- O cliente inclui os arquivos de captura no EXE. O teste integrado confirmou zero solicitações de HTML/scripts/estilos de captura ao servidor de sinalização. O Render permanece sem alterações; seu funcionamento entre computadores com estes pacotes precisa ser testado.
