# PJe TJCE – Automação de Expedientes

Este projeto consiste em um **script de automação para o sistema PJe (1º Grau) do Tribunal de Justiça do Estado do Ceará – TJCE**, desenvolvido para **otimizar tarefas repetitivas** realizadas durante a preparação de expedientes, intimações e comunicações processuais.

O objetivo do script é **reduzir cliques manuais**, **padronizar escolhas recorrentes** e **agilizar o trabalho do servidor**, sem alterar dados processuais ou interferir no funcionamento interno do sistema.

Trata-se de uma **ferramenta de apoio à decisão do usuário**, baseada na **identificação de padrões recorrentes** na configuração dos expedientes, a partir do uso diário do sistema.

> ⚠️ **Importante**: este projeto **não é um bot**, não executa atos processuais automaticamente e não substitui a atuação do servidor.

---

## 🧠 Natureza do projeto (esclarecimento importante)

Este script **não funciona como um bot ou robô de execução automática**.

Ele atua como uma **ferramenta de apoio ao usuário**, baseada em **pensamento computacional e análise de padrões**, auxiliando na **configuração dos expedientes** a partir de comportamentos recorrentes observados no uso cotidiano do PJe.

Em termos práticos, o script:
- observa o estado da tela
- identifica padrões previsíveis (ex.: campos em branco, opções padrão, fluxos repetidos)
- **auxilia o usuário na configuração da interface**, sempre permitindo intervenção, conferência e ajustes manuais

Nenhuma ação é executada sem que o servidor:
- visualize a tela
- revise as informações
- finalize o ato processual de forma consciente

---

## 🎯 Qual problema o projeto resolve?

No uso diário do PJe, o servidor precisa repetir várias ações manuais, como:

- Selecionar sempre os mesmos tipos de comunicação
- Ajustar prazos individualmente, linha por linha
- Expandir listas de partes e advogados
- Corrigir escolhas automáticas do sistema
- Refazer seleções após recarregamentos da tela

Essas ações, embora simples, **consomem tempo**, aumentam o risco de erro e tornam o fluxo de trabalho mais lento.

Este script atua **somente na interface do usuário**, auxiliando o usuário na execução dessas tarefas repetitivas de forma segura, transparente e reversível.

---

## ⚙️ O que o script faz, na prática?

### 1️⃣ Mantém o select nativo do PJe
- Remove apenas o componente visual *Select2*
- Preserva o comportamento original dos campos do sistema
- Evita inconsistências visuais e problemas de foco

### 2️⃣ Aplica padrões inteligentes automaticamente
- Define **Intimação** quando o campo de comunicação está em “Selecione”
- Define **Diário Eletrônico** quando o meio está como “Sistema”
- Não sobrescreve escolhas feitas manualmente pelo usuário

### 3️⃣ Facilita o preenchimento de prazos
- Adiciona botões rápidos de prazo ao lado de cada linha
- Cria botões no topo da tabela para aplicar o prazo a todos os destinatários
- Evita duplicações e reaplicações indevidas

### 4️⃣ Automatiza a seleção de advogados
- Cria botões para selecionar:
  - Advogados do Polo Ativo
  - Advogados do Polo Passivo
- Executa automaticamente o comando **“Mostrar todos”**, garantindo que a lista esteja completa antes da seleção

### 5️⃣ Ajusta o agrupamento de forma condicional
- O campo **“Agrupar com”** é configurado automaticamente
- A alteração ocorre **somente quando o meio de comunicação for “Diário Eletrônico”**
- Evita alterações indevidas em outros tipos de comunicação

### 6️⃣ Informa quando o PJe muda
- Exibe avisos discretos (*toast*) na tela
- Informa quando um elemento, ID ou estrutura não é encontrado
- Facilita a identificação e correção após atualizações do PJe

---

## 🔒 Segurança, limites e responsabilidade

- ❌ O script **não salva, altera ou transmite arquivos do processo**
- ❌ Não executa comandos no backend do PJe
- ❌ Não pratica atos processuais de forma autônoma
- ❌ Não coleta nem envia informações
- ✅ Atua exclusivamente na **camada visual (frontend)** do navegador
- ✅ Serve apenas como **auxílio à configuração dos atos processuais**
- ✅ Pode ser removido a qualquer momento pelo Tampermonkey

O script não interfere na lógica interna do sistema PJe, limitando-se à **organização e ao preenchimento assistido da interface**.

A responsabilidade pela conferência, validação e finalização do ato processual permanece **integralmente com o usuário**.

---

## 🚀 Instalação

1. Instale a extensão **Tampermonkey** (Chrome ou Edge)

2. Configure as permissões da extensão Tampermonkey:

   a) No navegador (Chrome ou Edge), digite na barra de endereços:
      `chrome://extensions`

   b) Localize a extensão **Tampermonkey** na lista de extensões

   c) Clique no botão **“Detalhes”**

   d) Na tela de detalhes da extensão, verifique se as seguintes opções estão **ativadas (em azul)**:
      - Permitir que esta extensão leia e altere dados de todos os sites
      - Permitir scripts de usuário (*Allow User Scripts*)
      - Permitir acesso a URLs de arquivo
      - Coletar erros
      - Fixar na barra de ferramentas (opcional, mas recomendado)

   e) Confirme que a extensão esteja **ativada (ligada)**

   Essas configurações são necessárias para que o script funcione corretamente no ambiente do PJe.


3. Confira as permissões conforme a imagem abaixo:

<img width="643" height="934" alt="image" src="https://github.com/user-attachments/assets/5130c99c-e807-4222-bec7-57ab64f3dff8" />

4. Abra uma nova janela do navegador

5. Acesse o link de instalação direta:

👉 https://raw.githubusercontent.com/Melhorias-PJe/script/main/pje-tjce-automacao.user.js

6. Clique em **Install**

---

## 📄 Licença

Este projeto é distribuído sob a licença **Apache License 2.0**.
