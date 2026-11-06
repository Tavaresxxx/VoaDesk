# VoaDesk 0.5.0 — interface clara e duas intenções

O redesenho mantém a interface web local em HTML/CSS/JavaScript e o cliente em Windows Forms. Não altera registros de dispositivos, derivação de códigos, banco/arquivos de clientes, permissões de sessão, credenciais ou histórico existentes.

## Telas e identidade

- Início: Acessar outro dispositivo e Receber acesso. Clientes salvos, ajuda e diagnóstico possuem áreas próprias. A busca de clientes filtra a agenda local; selecionar um cliente preenche o código e retorna ao início.
- Receber acesso abre o cliente Windows real, com o mesmo servidor já configurado no técnico. O código do dispositivo continua sendo criado e apresentado pelo cliente; a tela web não inventa um identificador. Abrir o cliente não autoriza captura nem controle.
- Cliente Windows compacto: logo, identificação, atualização e mensagens breves. O código pode ser copiado por clique, Enter ou Espaço. Consentimento, mudança de permissão e encerramento aparecem durante um atendimento; opções de inicialização e reconexão continuam na bandeja.
- Espera, atendimento e diálogo de cliente salvo usam a mesma paleta e hierarquia. Preferência de imagem, orientação e tela cheia permanecem disponíveis; o diagnóstico fica recolhido até ser solicitado.
- Compartilhamento: autorização, seleção explícita de monitor, conexão, compartilhamento confirmado e encerramento possuem estados próprios. Cancelar o seletor informa o ocorrido e encerra a solicitação.
- Apenas tema claro, com branco, preto, azul e cinzas. Cores, tipografia, espaçamento, foco e controles web estão em `src/ui/theme.css`. O equivalente nativo está em `native/Theme.cs`.
- A marca-d'água utiliza recortes da logo original, com baixa opacidade e áreas laterais reservadas, separadas do conteúdo e dos controles. O serviço de captura obtém a mesma arte a partir do recurso de marca incluído no código, sem depender de arquivos gerados pelo build Windows.

## Validação local

Build Windows e 44 testes Node de domínio, segurança e HTTP, executados com `node --test --test-concurrency=1 tests/*.test.mjs`. Uma execução concorrente com compilação e empacotamento apresentou `ECONNRESET` no ensaio de upload fragmentado; a repetição sem essa concorrência passou. O leitor de corpos HTTP e seus limites não foram alterados neste redesenho. A rota local de abertura do cliente exige cookie, origem e cabeçalho do aplicativo; ignora destinos e comandos recebidos no corpo e utiliza somente o servidor configurado.

Os ensaios de interface e cliente verificam agenda, diálogo, seleção, consentimento, cancelamento com resposta atrasada, recusa, expiração, falha no encerramento com nova tentativa, código estável após reabertura, atualização com assinatura temporária e liberação da entrada após revogação.

`tools/redesign-smoke.mjs` usa dados temporários em localhost. Audita dez estados com axe-core (WCAG A/AA), testa busca de clientes, larguras de 320, 390, 760, 1024 e 1440 pixels, navegação por teclado, preferência de movimento reduzido, tema claro mesmo sob preferência escura e separação da marca-d'água. Testa abertura do receptor com destino simulado, não executa captura real nem injeta entrada no Windows. Para reproduzir:

```powershell
npm install --prefix .cache/design-qa --package-lock=false --no-save axe-core
$env:FAROL_PLAYWRIGHT = 'C:\caminho\playwright\index.mjs'
npm run test:design
```

A instalação de Playwright e as ferramentas de teste ficam fora da distribuição. É possível indicar `VOADESK_AXE` para um `axe.min.js` já instalado. Os ensaios nativos de código e atualização respeitam a escala de DPI do Windows; isso não substitui uma matriz completa de monitores e escalas.

`tools/support-smoke.mjs` verifica H.264 1080p com fonte sintética entre páginas, permissões e encerramento. Os ensaios da ponte nativa usam um destino de entrada de teste. Esses resultados não comprovam captura e controle de outro computador.

## Pacotes e publicação

O pacote do técnico inclui fontes de execução, marca, executáveis e Node, sem configurações, identidades ou dados locais. Sua instalação deve receber os arquivos novos preservando `.runtime`. O cliente continua sendo distribuído como executável separado. Publicar o servidor no Render não substitui aplicativos em outros computadores nem implementa atualização automática externa.

O serviço mantém sinalização e presenças em memória, conforme a configuração existente. Não representa histórico permanente. Sessões entre dois computadores, captura real, controle físico, escalas/monitores diversos e redes diferentes ainda exigem validação própria; não há TURN nesta entrega.
