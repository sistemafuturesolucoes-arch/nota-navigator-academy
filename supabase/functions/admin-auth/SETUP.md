# Primeiro acesso administrativo

A função `admin-auth` cria e autentica o usuário administrativo sem expor a chave privilegiada do Supabase no navegador.

## Preparar o segredo de bootstrap

1. Abra o projeto Supabase `Manual Interativo` (ref. `itbppoailqkuxajesgys`).
2. Acesse **Edge Functions → Secrets**.
3. Crie o segredo `ADMIN_BOOTSTRAP_SECRET` com um valor aleatório forte (recomendado: 32 bytes ou mais).
4. Salve o segredo em um gerenciador seguro. Ele não deve ser colocado no Git, no frontend ou em variáveis `VITE_*`.

A função já está publicada. O novo segredo fica disponível sem precisar publicar outra versão.

## Criar o administrador

1. Abra a rota `/admin` do Manual Interativo.
2. Selecione **Configurar primeiro acesso**.
3. Informe o mesmo `ADMIN_BOOTSTRAP_SECRET` configurado no Supabase.
4. Defina a senha temporária para a conta `admin`.
5. Entre com o usuário `admin` e a senha temporária.
6. O painel exige a troca por uma senha com pelo menos 8 caracteres antes de liberar o editor.

A conta é criada com `app_metadata.role = admin` e `app_metadata.must_change_password = true`. A autorização usa exclusivamente `app_metadata`, nunca `user_metadata`.

## Segurança

- A chave privilegiada do Supabase é lida somente no ambiente da Edge Function.
- O endpoint de bootstrap exige o segredo `ADMIN_BOOTSTRAP_SECRET`.
- O bootstrap é de uso único: se o usuário já existir, a função não o recria.
- A função valida o JWT e a role administrativa antes de consultar ou alterar a sessão.
- Não coloque chaves secretas em arquivos do projeto nem as envie pelo chat.
