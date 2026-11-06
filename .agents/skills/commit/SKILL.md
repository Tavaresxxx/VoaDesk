---
name: commit
description: "Publicar o VoaDesk somente quando o usuario enviar o comando /commit, invocar $commit ou pedir explicitamente commit, push e publicacao. Nao executar por mencoes, perguntas, criacao do atalho ou melhorias locais."
---

# Publicação do VoaDesk

O pedido explícito autoriza commit, push e implantação das alterações pendentes do VoaDesk. Complete as etapas sem pedir confirmação rotineira. Criar esta skill não autoriza executá-la. Respeite limites de ferramentas e novas despesas.

1. Inspecione as instruções atuais, arquivos modificados e estado remoto. Leia as skills do Render aplicáveis antes de utilizá-lo. Destinos conhecidos: GitHub privado `Tavaresxxx/VoaDesk`, branch `main`; Render `VoaDesk`, serviço `srv-dbmct38ae00c73alh7t0`, workspace `Matheus's workspace`. Confirme a associação do serviço/repositório e não altere outros projetos.
2. Revise as mudanças para evitar regressões e arquivos privados. Exclua `.runtime`, `.cache`, `dist`, `.env*`, identidades, credenciais, nomes/códigos de clientes, capturas e dados operacionais. Preserve os arquivos locais. Não apague arquivos remotos apenas porque faltam no checkout parcial.
3. Execute os testes relevantes (`npm test` ou Node equivalente), builds e verificação dos fluxos afetados. Corrija falhas antes da publicação. Verifique os requisitos de persistência/configuração do servidor: armazenamento efêmero não pode ser apresentado como registro permanente de clientes. Não prometa recursos ainda não implementados nem considere testes locais como validação de sessão entre redes.
4. Faça um commit com mensagem objetiva; use a mensagem fornecida, se houver. Use Git local se existir um checkout íntegro e o executável estiver disponível. Caso contrário, prefira ferramentas GitHub conectadas: compare conteúdo/SHA remoto, preserve alterações concorrentes e envie somente arquivos revisados. Prefira operação de múltiplos arquivos em um commit quando disponível. Não use force push, reset destrutivo ou publique segredos. Se não houver mudanças, informe o resultado sem inventar commit.
5. Após push, identifique a revisão final. Se houver auto deploy no Render, acompanhe a implantação dessa revisão sem criar uma duplicata. Caso necessário, solicite uma implantação pelo conector. Não mude plano, cobrança ou credenciais sem autorização específica. Se não houver commit novo, verifique se a revisão pretendida já está publicada antes de disparar algo.
6. Aguarde resultado terminal, analise logs sem expor segredos e verifique saúde e comportamento afetado na URL publicada. Distinga build concluído, serviço Live e verificação HTTP externa. Em falha, corrija dentro do escopo e repita verificações necessárias; nunca declare publicação concluída com deploy em fila ou falho. Registre com precisão qualquer bloqueio de acesso/ferramenta.
7. Informe resumo, commit/revisão, URL, testes executados e limitações reais. Render implanta código do GitHub: não existe um segundo commit "no Render".

O atalho é uma convenção de instruções do projeto, não um hook Git, automação agendada ou garantia de registro de comando no menu do Codex. A skill também pode ser invocada explicitamente como `$commit`.
