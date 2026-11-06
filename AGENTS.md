# VoaDesk: instruções do projeto

## Trabalho local por padrão
As melhorias são feitas e verificadas em localhost. Não criar commits remotos, enviar ao GitHub, alterar serviços/credenciais ou publicar no Render sem pedido explícito de publicação. Preservar configurações, identidade dos clientes, histórico e dados locais. Não copiar .runtime, .cache, dist, segredos, códigos de clientes ou dados operacionais para o repositório.

## Comando /commit
Quando o usuário enviar `/commit` como comando (opcionalmente seguido de uma mensagem de commit), ler e executar `.agents/skills/commit/SKILL.md`. Esse comando autoriza validar as alterações pendentes deste projeto, fazer commit e push no GitHub e acompanhar a implantação do mesmo código no Render. Não pedir novamente a autorização já dada para essas etapas rotineiras.

Uma menção a `/commit` em uma pergunta, documentação, exemplo ou trecho citado não é uma invocação. Criar ou editar o comando também não o executa. Se a interface não aceitar comandos personalizados com barra, aceitar a mesma instrução em mensagem de texto ou a invocação explícita da skill `$commit`. Não alegar que foi instalado um comando nativo no menu do aplicativo Codex.

Responder em português e separar verificações locais, implantação e validações entre computadores. Nunca apresentar pareamento como vídeo/controle funcional.
