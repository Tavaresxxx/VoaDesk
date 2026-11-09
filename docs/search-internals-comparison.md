# Busca interna: TeamViewer, AnyDesk, RemotePC e VoaDesk

Investigação de 09/11/2026. Objetivo: inspecionar implementações embarcadas e melhorar a busca local do VoaDesk. A documentação funcional foi usada como apoio; as conclusões internas abaixo exigem artefatos, hashes e âncoras de código.

## Alvos e fronteiras

| Produto | Artefato realmente investigado | Proveniência |
| --- | --- | --- |
| TeamViewer | Windows Classic Portable **15.83.5.0**, baixado para análise estática | [Distribuição Portable oficial](https://www.teamviewer.com/en-us/global/support/knowledge-base/teamviewer-classic/modules/portable/); assinaturas válidas TeamViewer Germany GmbH. Não foi encontrada instalação nos locais verificados. |
| AnyDesk | Windows **9.8.0**, executável instalado nesta máquina | Arquivo original identificado por SHA-256; carregador e payload tratados separadamente. |
| RemotePC | Viewer Windows: instalador **7.7.16.2**, módulo UI extraído **7.6.5.2** | [Download oficial](https://www.remotepc.com/download); assinaturas válidas IDrive Inc. Não foi encontrada instalação nos locais verificados. As duas versões não foram equiparadas. |

Não houve execução dos aplicativos ou instaladores dos três produtos, login, conexão remota ou leitura de dados de conta. Ferramentas de análise e extração foram executadas em diretórios ignorados; nenhuma configuração de sistema ou serviço foi alterada. Ausência de instalação é uma conclusão limitada aos locais, registros e processos enumerados nos relatórios específicos.

## TeamViewer: JavaScript embarcado recuperado

O recurso `BIN/SCITERUI` de `TeamViewer_StaticRes.dll` foi localizado no offset **3.600.504**, com **3.009.058 bytes**. Um leitor estático SAr/LZF recuperou **1.190/1.190 arquivos**, validando os tamanhos declarados. O registro PE REA é `ev_fd8a6a65429361454c8695dd5105b9722e0fd379680f862ed14d51cdb11e08f4`.

Três fontes selecionadas foram analisadas pelo REA: **40.615 bytes, 4.198 nós AST, zero falhas de parsing**. Evidence `ev_710af03f6f281a61a7672e02dd788b03d3a59cd0c08642630c06657a9dbb6cc6`.

| Âncora recuperada | Funcionamento estabelecido estaticamente |
| --- | --- |
| `instant-connect.js`, linhas 211–245 | Filtra a lista de recentes por substring de `displayText`, convertendo nome e consulta para minúsculas. Consulta vazia preserva as entradas. |
| Mesmo arquivo, linhas 91–108 | Na confirmação, resolve nome exato ao ID do dispositivo; quando necessário, remove espaços do ID digitado antes de chamar a ação de conexão. |
| `partneridcombobox.js`, linhas 51–128 | Navegação por setas e fechamento por Escape. Enter com popup aberto fecha a lista; com popup fechado chama a confirmação. Selecionar e confirmar são caminhos distintos. |
| Mesmo arquivo, linhas 334–367 | Realce visual separado da decisão de busca, com lista de altura limitada e rolagem. Não há corte de seis resultados nesse trecho. |
| `control-remote-computer.js`, linhas 56–61 | Outra rota encaminha o texto ao método nativo `SearchMRUItems`; o algoritmo desse método não foi recuperado. |

Esses trechos pertencem a **Classic/InstantConnect e ao combobox embarcado**. Não estabelecem toda a Global Search moderna, execução efetiva, persistência dos recentes ou tráfego de rede. O índice reutilizável implementado no VoaDesk não foi encontrado nesse filtro do TeamViewer.

Evidências: [relatório detalhado](../artifacts/search-comparison/teamviewer/report.md), [módulos, linhas, hashes e intervalos](../artifacts/search-comparison/teamviewer/findings.json), [registro JS REA](../artifacts/search-comparison/teamviewer/search-js-evidence.json).

## RemotePC: fluxo de busca recuperado do CIL

A cadeia de aquisição distingue o wrapper MSI do cliente real. O wrapper contém a URL do instalador; o módulo `RPCViewerUIU.exe` foi extraído do Inno Setup sem executar o instalador. SHA-256 do módulo UI: `58e589909637e826404ce47b4a8b53ff7165f41b78f75f797201fca3811cdd87`.

O registro canônico de membros e CIL é `ev_86cc0b134e6cebd805c7ad37d3f1fec3ba0126a18fcc453bfb435dfebb6bb6d7`.

| Etapa | Token e offset do corpo | Observação interna |
| --- | --- | --- |
| Ligação do campo WPF | `0x06000ee8`, offset 652624 | O conector associa `treeSearchBox` a `treeSearchBox_TextChanged`. |
| Normalização e espera | `0x06000b5f`, offset 419904 | Consulta passa por Trim e ToLower; constante 100 no IL 96 é passada ao Debounce no IL 113. |
| Debounce | `0x06001532`, offset 767196 | Para temporizador anterior, cria novo temporizador e o inicia: intervalo de **100 ms** no caminho do campo. |
| Filtragem | `0x06000b5c`, offset 418560 | `QueryGroupsAndMachinces` usa coleções clonadas de grupos/hosts já carregadas e encaminha resultado para `UpdateUIView`. |
| Nome do grupo | `0x06001830`, offset 790112 | Compara nome do grupo em minúsculas por Contains. |
| Nome da máquina | `0x06001833`, offset 790285 | Compara nome da máquina em minúsculas por Contains. |
| Estado da máquina | `0x0600183e`, offset 790794 | Um ramo combina correspondência do nome com estado. |

Isso demonstra um fluxo interno de filtragem local sobre coleções já carregadas. Não demonstra ausência de rede nos demais componentes, busca por ID, remoção de acentos, ranking completo ou resultados em execução. As âncoras são CIL interpretado; não se recuperou C# original.

Evidências: [relatório e cadeia de aquisição](../artifacts/search-comparison/remotepc/report.md), [fluxo com âncoras CIL](../artifacts/search-comparison/remotepc/search-flow.json), [ligação campo → handler](../artifacts/search-comparison/remotepc/entrypoint.json).

## AnyDesk: carregador e payload

A análise inicial de recursos PE não estabelecia a implementação da busca. Nesta investigação, a fronteira foi aprofundada a partir do executável instalado: SHA-256 `467d1395b61d4b886329571b564fb21db01639acd2799439646c85b9aeaec175`.

O arquivo tem um carregador pequeno e uma seção `.itext` de **31.038.976 bytes virtuais**, sem bytes diretamente armazenados para essa seção. A sequência `win_loader` no caminho de depuração, no offset **12556**, pertence ao carregador, não ao algoritmo da busca. A varredura inicial de strings era insuficiente para concluir algo sobre a busca.

A desmontagem do carregador permitiu reimplementar, sem executar código do produto, a cadeia **XOR-LCG → LZMA → inversão do filtro x86 BCJ**. O resultado é um PE32 de **30.907.904 bytes**, SHA-256 `84e9191c5a3af44ef5cbc94eab1637049669e17136f2579e2c715ffbc4e47b09`. A recodificação BCJ reproduziu exatamente a etapa anterior; intervalos, instruções e hashes de cada derivado estão no manifesto. O derivado não recebe uma autenticação Authenticode própria: sua proveniência é a cadeia até o original.

| Âncora no PE recuperado | Offset da constante | Instrução que a referencia |
| --- | --- | --- |
| `abook_roster_search_combo` | 26.942.672 | VA `0x106CFA7C` |
| `ad_book_filter` | 26.996.056 | VA `0x107324DF` |
| `tag_tree_view_filter_edit` | 26.995.924 | VA `0x107322A2` |
| `filter_mode_btn` | 26.995.232 | VA `0x10735586` |
| `toolbar_edit_popup_search_item` | 27.148.052 | VA `0x10870713` |
| `search_results_listview` | 27.133.552 | VAs `0x108429CC` e `0x1086E867` |

Há referências de instruções a essas constantes, além de rótulos internos de modos e limpeza de filtros. Isso aprofunda a validação interna: não se trata apenas de identificar o executável. **Não foi recuperado o comparador, o ranking, a normalização ou o fluxo completo de eventos da busca.** As referências diretas foram decodificadas, mas não foi recuperado um CFG nem demonstrada a execução dos handlers. Associar os nomes a componentes de interface é uma inferência; aplicar os rótulos all/any a texto ou etiquetas continua desconhecido.

Evidências: [relatório AnyDesk](../artifacts/search-comparison/anydesk/REPORT.md), [manifesto reproduzível](../artifacts/search-comparison/anydesk/reconstruction-manifest.json), [referências nativas](../artifacts/search-comparison/anydesk/search-native-anchors.json), [seções de entrada](../artifacts/search-comparison/anydesk/static-candidates.json), [inventário PE inicial REA](../artifacts/anydesk-search/pe-resources.json). A recuperação e as instruções são observações estáticas por ferramentas comuns, separadas do registro de recursos REA.

## Melhoria interna e funcional do VoaDesk

A implementação continua própria, sem incorporar fontes ou binários dos fornecedores.

1. **Índice preparado na mudança da agenda.** `createClientSearch` cria um snapshot imutável e normaliza nomes/códigos uma vez. A interface o reconstrói ao carregar ou adicionar clientes; consultas seguintes reutilizam os campos preparados.
2. **Filtros por dados reais.** Buscar em permite nome, código ou ambos, nas sugestões e na agenda. Cada sugestão informa o campo que correspondeu. Grupos e presença online não foram inventados.
3. **Lista completa acessível.** As seis sugestões continuam compactas; Ver todos abre a lista inteira e preserva texto e filtro, em vez de esconder os demais clientes.
4. **Contagem antes do limite.** O índice calcula o total antes de limitar as sugestões. A quantidade exibida e a navegação à lista completa usam a mesma consulta.
5. **Consulta separada do atendimento.** Filtrar, navegar e selecionar não enviam solicitações. O botão Solicitar acesso e o consentimento do cliente permanecem no fluxo existente.

O filtro embarcado do TeamViewer sustenta a distinção entre seleção e confirmação e a necessidade de percorrer mais resultados. O RemotePC demonstra separação entre obtenção dos dados, filtragem e atualização visual. Índice imutável, normalização de acentos, ranking e os filtros nome/código são decisões próprias do VoaDesk. Não foi copiado o atraso de 100 ms: a agenda tem limite de mil contatos e o índice evita recalcular os campos; introduzir atraso fixo exige uma necessidade medida.

```mermaid
flowchart LR
  A[Agenda carregada ou alterada] --> B[Snapshot e índice normalizado]
  C[Texto e filtro de campo] --> D[Consulta no índice]
  B --> D
  D --> E[Ranking estável e total]
  E --> F[Até seis sugestões]
  E --> G[Lista completa com consulta preservada]
  F --> H[Selecionar cliente]
  G --> H
  H --> I[Solicitar acesso]
  I --> J[Consentimento do cliente]
```

## Validação local

- `npm test`: **57 testes aprovados**, incluindo consulta repetida sobre mil contatos sem reler os campos da agenda de origem, reconstrução explícita do snapshot, total antes do limite e distinção dos campos.
- `npm run test:search`: filtros, motivo da correspondência, acesso a todos os resultados com consulta/filtro preservados, teclado, acentos, códigos agrupados, falha de carregamento e texto literal seguro. Nenhuma solicitação durante busca/seleção, nenhuma requisição externa da interface e agenda de teste preservada.
- `npm run test:design`: regressão visual/responsiva e verificações automáticas de acessibilidade aprovadas.
- Janela Windows/WebView2 da cópia instalada: filtro de campo, busca e seleção por teclado aprovados; a regressão nativa final também passou com vídeo e entrada sintéticos. O teste de encerramento passou a aguardar a saída efetiva dos processos de teste, com prazo de 15 segundos, em vez de presumir conclusão após uma pausa fixa de 1,4 segundo. A condição que exige ausência de arquivos parciais foi mantida. A primeira execução está preservada em `artifacts/search-comparison/voadesk-native-first-run.json`.
- ZIP e duas cópias extraídas atualizados e conferidos: 59 arquivos por manifesto em cada cópia, com os dois arquivos existentes de dados/configuração conferidos por hash antes e depois da atualização e QA.

Esses testes são do VoaDesk em localhost, com dados sintéticos. Não são replay dos produtos analisados, nem validação de captura/controle entre computadores. A atualização permanece local; não houve publicação.

Evidências do VoaDesk: [teste de busca](../artifacts/search-local/report.json), [captura desktop](../artifacts/search-local/sugestoes-desktop.png), [captura em 390 px](../artifacts/search-local/sugestoes-390.png), [regressão da janela Windows](../artifacts/native-technician/report.json), [atualização das cópias locais](../artifacts/installation-local/internals-update.json).
