# PJe TJCE – Automação de Expedientes

Este projeto consiste em um **script de automação para o sistema PJe (1º Grau) do Tribunal de Justiça do Estado do Ceará – TJCE**, desenvolvido para **otimizar tarefas repetitivas** realizadas durante a preparação de expedientes, intimações e comunicações processuais.

O objetivo do script é **reduzir cliques manuais**, **padronizar escolhas recorrentes** e **agilizar o trabalho do servidor**, sem alterar dados processuais ou interferir no funcionamento interno do sistema.

---

## 🎯 Qual problema o projeto resolve?

No uso diário do PJe, o servidor precisa repetir várias ações manuais, como:

- Selecionar sempre os mesmos tipos de comunicação
- Ajustar prazos individualmente, linha por linha
- Expandir listas de partes e advogados
- Corrigir escolhas automáticas do sistema
- Refazer seleções após recarregamentos da tela

Essas ações, embora simples, **consomem tempo**, aumentam o risco de erro e tornam o fluxo de trabalho mais lento.

Este script atua **somente na interface do usuário**, automatizando essas tarefas repetitivas de forma segura e transparente.

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

## 🔒 Segurança e limites

- ❌ O script **não altera dados processuais**
- ❌ Não executa ações no backend do PJe
- ❌ Não coleta nem envia informações
- ✅ Atua exclusivamente no navegador do usuário
- ✅ Pode ser removido a qualquer momento pelo Tampermonkey

---

## 🚀 Instalação

1. Instale a extensão **Tampermonkey** (Chrome ou Edge)
2. Sete as permissões conforme na imagem: <img width="643" height="934" alt="image" src="https://github.com/user-attachments/assets/5130c99c-e807-4222-bec7-57ab64f3dff8" />
3. Abra uma nova janela do navegador e Acesse o link abaixo
4. Clique em **Install**

👉 Link de instalação direta: https://raw.githubusercontent.com/Melhorias-PJe/script/main/pje-tjce-automacao.user.js


