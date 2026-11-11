# Ajustes locais de desempenho e recuperacao

## Comportamento implementado

- Movimentos antigos/duplicados sao descartados, inclusive apos envio da fila.
  Cliques e liberacoes mantem sua barreira de ordenacao.
- A captura nativa define o canvas; o encoder usa escala 1. O caminho legado
  conserva o redimensionamento no encoder.
- Novas conexoes comecam em 720p, 30 FPS e 2,5 Mbps como tetos. Os perfis
  anteriores continuam disponiveis.
- Adaptacao com media exponencial de peso 0,5, sequencias independentes de
  rede/processamento, tres amostras ruins, quinze boas e intervalos minimos
  de vinte/trinta segundos. RTT isolado nao degrada o video. A recuperacao
  de FPS exige capacidade para o proximo patamar, com margem de 10%.
- Bitmap, Graphics, superficie reduzida, parametros e buffer JPEG reutilizados.
  O buffer fica protegido ate terminar a resposta, sem ToArray por quadro.
- HTTP local persistente: dez segundos por solicitacao, no maximo cem por conexao.
- Estado nativo por SSE autenticado, heartbeat a cada 500 ms, timeout de
  cabecalho de cinco segundos, pausa sem heartbeat em 1.200 ms e expiracao
  local do consentimento em oito segundos. Reconexoes esperam 250 a 1.000 ms.
  Epocas antigas e heartbeats atrasados sao recusados. Revogacao local imediata.
  Servidores antigos conservam o fallback anterior de consultas frequentes.
- Arquivos negociam suporte binario e janela de quatro blocos de 16 KiB,
  com IO ordenado e buffer SCTP limitado. Cancelar aguarda os blocos em voo
  antes de remover arquivos parciais. Pares antigos conservam Base64/bloco unico.
- Recuperacao ICE com revisoes de oferta/resposta, uma tentativa por interrupcao
  e prazo absoluto de oito segundos. Requer autorizacao valida e nao reabre
  atendimento encerrado ou expirado.
- Ate 128 atendimentos com tokens, tickets, comandos e consentimentos isolados.
  Limite de um por cliente e por instancia autenticada do aplicativo tecnico.
  Nao cria contas individuais: utiliza a credencial de operador existente.

## Diagnostico

FPS por intervalo, incluindo zero sem novos quadros, idade do ultimo quadro,
interrupcoes de apresentacao e duracao de congelamentos exposta pelo WebRTC.
Paginas ocultas nao geram interrupcoes artificiais de apresentacao. Essas
medidas nao sao latencia visual completa nem identificam a causa sozinhas.

P50/p95 de captura/ponte usam ate 300 observacoes. Exportar metricas gera JSON
com ate 600 amostras de campos numericos permitidos, sem imagens, SDP, tokens,
nomes, caminhos ou comandos.

## Validacao local

- Compilacao Windows concluida, preservando o endpoint anteriormente usado.
- Suite automatizada: 84 testes aprovados.
- Sintaxe de 71 arquivos JavaScript verificada.
- Integracao desktop: H.264 sintetico, dois monitores enumerados, comandos em
  coletor sem injecao no SO, arquivos nos dois sentidos com hashes iguais,
  preservacao de arquivo existente e cancelamento.
- Reutilizacao HTTP e renegociacao ICE com credenciais novas verificadas.
  A interrupcao foi induzida por evento sintetico, sem queda real de rede.
- Cliente Windows: consentimento explicito e encerramento pelo botao local.
- Falhas no fluxo persistente: pausa durante atraso de 1.800 ms, recuperacao,
  expiracao e rejeicao de resposta anterior ao encerramento.

Evidencias em artifacts/desktop-local, artifacts/support-local,
artifacts/security-local e artifacts/drop-validation, fora do repositorio.
Os testes usam identidades/arquivos temporarios. A implantacao e uma etapa
separada e nao valida sessoes entre computadores. Credenciais sao preservadas.

Distribuicao 0.7.3: Cliente avulso e duas copias locais do Tecnico atualizados,
com manifesto de 61 arquivos por copia e backup dos programas anteriores.
O arquivo privado encontrado nas instalacoes foi conferido por hash, sem alteracao.

## Limites e proxima medicao

DXGI/Desktop Duplication e remocao do JPEG nao foram implementados. A captura
GDI inicial ainda usa toda a resolucao; reutilizacao de buffers e FPS menor
nao eliminam esse custo. Migrar exige integrar superficies GPU e encoder.

Pendentes: captura real, CPU/memoria, congelamentos, comandos, trocas em
1440p/4K, perda real, recuperacao e conexao direta/TURN entre dois Windows
em redes distintas. TURN de producao nao foi consultado/alterado. Nao ha
medida antes/depois entre computadores.

Referencias primarias:
- https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api
- https://webrtc.org/getting-started/peer-connections
