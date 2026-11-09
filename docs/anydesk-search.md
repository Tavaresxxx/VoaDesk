# Busca do AnyDesk e adaptação no VoaDesk

Investigação local em 09/11/2026. Escopo: busca de contatos na interface do técnico.

Este documento preserva a primeira etapa da investigação. A [comparação interna posterior](search-internals-comparison.md) recuperou o payload nativo do AnyDesk e código de busca de TeamViewer e RemotePC, e registra a implementação atual do índice e filtros do VoaDesk.

## Evidências e limites

| Evidência | Resultado verificado | O que permite afirmar |
| --- | --- | --- |
| AD-01 — [Visão geral oficial](https://support.anydesk.com/docs/anydesk-overview) | O campo de endereço inicia uma conexão ao pressionar Enter; favoritos e sessões recentes são apresentados separadamente. | Endereço e acesso fazem parte do fluxo principal. |
| AD-02 — [Changelog oficial para Windows](https://anydesk.com/en/changelog/windows) | As versões 7.0.6 e 7.1.6 registram correções para espaços na busca de IDs e nomes com acentos na busca global. A 9.6.0 registra categorias no painel de busca. | A busca documentada cobre IDs, nomes e categorias. Não revela o algoritmo. |
| AD-03 — [Agenda oficial](https://support.anydesk.com/docs/address-book) | Contatos podem ser organizados por etiquetas e filtrados; selecionar uma entrada permite iniciar conexão. | A agenda fornece entradas pesquisáveis. |
| AD-04 — Artefato instalado | `C:\Program Files (x86)\AnyDesk\AnyDesk.exe`, versão 9.8.0, 8.555.448 bytes, PE32/x86. | Identidade do artefato encontrado nesta máquina; não prova comportamento em execução. |
| AD-05 — REA | `inspect_pe_resources`, Evidence `ev_8c7cea77edb08ec90a7dc17b501fb9f7a5f4adfb2a5f121a768fa80c87e7e76b`; inventário estático de 11 recursos. | Metadados e recursos do executável. Não recupera a implementação da busca. |

SHA-256 do executável: `467d1395b61d4b886329571b564fb21db01639acd2799439646c85b9aeaec175`.

O registro completo AD-05 está em `artifacts/anydesk-search/pe-resources.json`, fora da distribuição. A inspeção foi feita pela CLI REA 6.7.0, com o parser de recursos independente de descompilador. O MCP REA não estava registrado e os motores nativos não estavam disponíveis. Nenhuma configuração de ferramentas foi alterada.

A observação da interface foi tentada, mas o helper Windows falhou com `windows sandbox failed: helper_unknown_error: setup refresh had errors`. Portanto **não houve observação da busca do AnyDesk em execução**, nem envio de solicitações pelo AnyDesk. Não se estabeleceu o algoritmo de ranking, correspondência parcial, tolerância a erros, normalização exata de acentos, atalhos ou consultas de rede. As notas históricas do fabricante não constituem um teste da versão instalada.

## Comportamento implementado no VoaDesk

A implementação é própria e usa os contatos já carregados da agenda local:

- O campo inicial aceita nome ou código e mostra até seis sugestões, com nome e código identificáveis.
- Nome parcial, maiúsculas/minúsculas e acentos são normalizados. Espaços e hífens são ignorados na comparação de códigos.
- A lista completa de Clientes salvos usa o mesmo filtro. Também é possível combinar termos de nome com parte do código.
- Código exato tem prioridade, seguido de nome exato, prefixos e demais correspondências. Empates mantêm a ordem da agenda.
- Setas navegam pelas sugestões; Enter seleciona; Escape fecha; o botão de limpeza esvazia a busca.
- Selecionar preenche o código e move o foco para Solicitar acesso. A busca e a seleção não iniciam atendimento. Um código completo pode ser enviado diretamente pelo formulário existente.
- O consentimento do cliente continua obrigatório. Nenhum alias externo, presença online, descoberta LAN, favorito ou histórico identificável foi criado.

Normalização, ranking, limite de sugestões e seleção em duas etapas são decisões de produto do VoaDesk; não são descritos como reprodução do algoritmo interno do AnyDesk. O histórico atual não contém nomes/códigos de clientes, por isso não é usado como fonte de resultados.

## Validação reproduzível

`npm test` verifica correspondência, ordem, preservação dos contatos e regressões do projeto. `npm run test:search` verifica sugestões na interface, códigos agrupados, acentos, teclado, campos vazios, erros de carregamento, segurança de texto e ausência de chamadas de sessão durante a busca. Usa dados sintéticos e serviços temporários; relatório e imagens ficam em `artifacts/search-local/`.

Os testes de atendimento e vídeo são verificações locais distintas. A busca não estabelece captura ou controle entre computadores. Nenhuma publicação foi autorizada nesta tarefa.

### Resultados desta execução

- `npm test`: 55 testes aprovados.
- `npm run test:search`: aprovado; nenhuma violação de acessibilidade na tela de sugestões, nenhuma requisição externa da interface e nenhuma alteração na agenda de teste.
- `npm run test:design`: aprovado nos cinco tamanhos de tela já cobertos pelo projeto.
- Janela Windows/WebView2 da cópia instalada: busca por nome, sugestões, setas e Enter aprovados com runtime portátil. A regressão nativa completa passou na repetição. A primeira execução falhou na checagem de encerramento durante transferência; não foi possível estabelecer se havia arquivo concluído ou parcial, e a causa não foi determinada. O teste passou sem alterar sua condição de aprovação; foi acrescentada somente a coleta de nomes dos arquivos de teste para diagnóstico.
- ZIP e ambas as cópias extraídas atualizados: 59 arquivos conferidos por manifesto em cada cópia. Dois arquivos locais de dados/configuração existentes foram comparados por hash e preservados. Nenhuma publicação ou validação entre computadores foi realizada.

Evidências locais:

- [Registro estático completo REA](../artifacts/anydesk-search/pe-resources.json)
- [Busca do VoaDesk em desktop](../artifacts/search-local/sugestoes-desktop.png)
- [Busca do VoaDesk em 390 px](../artifacts/search-local/sugestoes-390.png)
- [Relatório da busca](../artifacts/search-local/report.json)
- [Busca na janela Windows](../artifacts/native-technician/busca-clientes.png)
- [Regressão nativa final](../artifacts/native-technician/report.json)
- [Primeira execução da regressão nativa](../artifacts/search-local/native-regression-first-run.json)
- [Atualização das instalações locais](../artifacts/installation-local/search-update.json)
