# Recuperação de sinalização — 0.7.1 local

Correção da queda reproduzida na 0.7.0: um atraso de sinalização maior que
1.200 ms desabilitava a entrada, invalidava a ponte de captura e retornava 403;
o navegador encerrava toda a sessão.

## Comportamento

- Mouse/teclado continuam pausados e liberam entradas mantidas após 1.200 ms
  sem confirmação recente. Comandos pausados não são acumulados para replay.
- A autorização da ponte depende do consentimento da sessão e de uma concessão
  de no máximo 8 segundos, separada do estado Enabled da entrada.
- O watchdog revoga o consentimento local quando essa concessão expira; uma
  resposta posterior não restaura a autorização expirada.
- Recusa/Encerrar no cliente continuam invalidando a ponte imediatamente.
  Respostas 401/403 da sinalização revogam imediatamente o acesso nativo.
- Erros transitórios da sinalização pausam entrada; consultas posteriores podem
  recuperar a sessão dentro do prazo limitado. A interface tolera até 5 segundos
  de erros transitórios. Erros de autorização e estado encerrado são definitivos.
- Falhas de transporte na ponte retornam 503, sem confundi-las com autorização
  recusada (403).
- Captura 409 por geração antiga ou 429 por ocupação descarta o quadro e agenda
  nova captura. Sem quadro válido por mais de 8 segundos, encerra com erro.
- O semáforo protege captura/codificação, sem permanecer ocupado durante o
  envio HTTP. Há uma única solicitação de quadro da aplicação por vez.

## Validação

`tools/signal-delay-smoke.mjs 300` e `1800` usam ClientWindow real, proxy
local com atraso, pixels sintéticos e coletor de entrada, sem controlar o Windows.
Com 1.800 ms: captura mantém HTTP 200, entrada pausa, recupera e o teste de
revogação local recebe 403 imediatamente. A concessão expirada é rejeitada.
Com 300 ms, a captura permanece disponível sem pausa de entrada.

`tools/desktop-session-smoke.mjs` injeta seis respostas 429 de captura e uma
resposta 503 em cada ponta da sinalização. Confere recuperação, vídeo H.264,
arquivos, cancelamento, autorização e encerramento. O teste foi atualizado para
a tela cheia por ação explícita da interface atual.

63 testes Node e o teste nativo de resposta atrasada após revogação passaram.
Compilar fixtures com `tools/build-test-tools.ps1` antes dos testes nativos.

Distribuição: EXEs e ZIP locais 0.7.1. Identidades, histórico e configuração são
preservados. A atualização deve ser aplicada às duas pontas; um EXE antigo em
outro computador ainda contém o comportamento anterior. Não houve publicação
desta correção no servidor. Os endpoints continuam compatíveis com a sinalização
0.7.0 publicada.

As verificações são locais e sintéticas. Não substituem a confirmação de vídeo
e controle reais nos dois computadores do usuário nem homologação de 30 minutos.
