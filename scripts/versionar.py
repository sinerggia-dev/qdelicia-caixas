# -*- coding: utf-8 -*-
"""
Qdelicia Frutas - Controle de Caixas
Carimba a versao de app.js e styles.css nas paginas HTML.

POR QUE ISTO EXISTE
Nao ha passo de build: as paginas apontam para `app.js` e `styles.css` direto. O navegador
guarda os dois, e depois de um deploy a pessoa continua vendo a tela antiga sem nenhum sinal
de que esta desatualizada - as vezes com metade do codigo novo e metade do velho, que e pior
do que so estar velho.

O sufixo e o hash do CONTEUDO, nao a data: arquivo que nao mudou mantem o mesmo endereco e
segue vindo do cache. So quem mudou de verdade forca o download.

    python scripts/versionar.py

Rode antes de cada commit que mexa em app.js ou styles.css. Sem argumento nenhum; ele reescreve
as paginas no lugar e diz o que mudou.
"""
import hashlib
import io
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGINAS = ('index.html', 'admin.html', 'extrato.html')
ATIVOS = ('app.js', 'styles.css')


def versao(nome):
    """Hash curto do conteudo do arquivo."""
    with io.open(os.path.join(RAIZ, nome), 'rb') as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def main():
    versoes = {a: versao(a) for a in ATIVOS}
    for a, v in versoes.items():
        print('  %-12s v=%s' % (a, v))

    mexidos = []
    for pagina in PAGINAS:
        caminho = os.path.join(RAIZ, pagina)
        if not os.path.exists(caminho):
            continue
        s = original = io.open(caminho, encoding='utf-8').read()
        for ativo, v in versoes.items():
            # Casa com ou sem ?v= anterior, para poder rodar quantas vezes quiser.
            s = re.sub(r'(["\'])' + re.escape(ativo) + r'(\?v=[0-9a-f]+)?\1',
                       r'\g<1>' + ativo + '?v=' + v + r'\g<1>', s)
        if s != original:
            io.open(caminho, 'w', encoding='utf-8', newline='\n').write(s)
            mexidos.append(pagina)

    print('atualizadas:', ', '.join(mexidos) if mexidos else 'nenhuma (ja estavam em dia)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
