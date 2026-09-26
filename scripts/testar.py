# -*- coding: utf-8 -*-
"""Roda TODAS as suites de `teste/`, e nao uma lista escrita a mao.

POR QUE ISTO EXISTE
A lista das suites morava no CLAUDE.md, digitada. Ela derivou: dois arquivos —
`teste_backend.js` e `teste_permissoes.js` — nunca entraram nela, e quem seguia o
documento rodava sete de nove. Cinco afirmacoes ficaram vermelhas por semanas sem
ninguem ver, duas delas cobrando de volta uma caixa que o escritorio mandou tirar.

Lista escrita a mao envelhece calada. Esta DESCOBRE os arquivos, entao uma suite nova
entra no ciclo no minuto em que nasce, sem ninguem lembrar de nada.

    python scripts/testar.py
"""
import glob
import io
import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

# O CONSOLE DO WINDOWS E cp1252, e as suites falam com "✓" e "✗". Sem isto, o conferidor
# roda, ACHA as falhas e entao estoura ao IMPRIMI-LAS — justamente na hora em que ele
# teria alguma coisa a dizer. Medido: a sabotagem foi pega e o relatorio morreu.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def main():
    arquivos = sorted(glob.glob(os.path.join(RAIZ, 'teste', 'teste_*.js')))
    if not arquivos:
        print(u'NAO ACHEI SUITE NENHUMA em teste/ — ' +
              u'isto e um problema do proprio conferidor, nao do codigo')
        return 1

    ruins = []
    for caminho in arquivos:
        nome = os.path.basename(caminho)
        p = subprocess.run(['node', caminho], capture_output=True, text=True,
                           encoding='utf-8', errors='replace', cwd=RAIZ)
        saida = (p.stdout or '') + (p.stderr or '')
        # A conta sai da SAIDA, e nao so do codigo de saida: uma suite que estoura no
        # meio sai com codigo 1 e sem nenhum "✗", e o motivo dela e outro.
        falhas = saida.count(u'✗')
        if p.returncode == 0 and falhas == 0:
            print(u'  ok      %-26s %d conferencias' % (nome, saida.count(u'✓')))
            continue
        ruins.append((nome, falhas, saida))
        print(u'  FALHA   %-26s %s' % (
            nome, u'%d afirmacao(oes)' % falhas if falhas
            else u'estourou (codigo %d)' % p.returncode))

    if not ruins:
        print(u'\n%d suite(s), todas verdes' % len(arquivos))
        return 0

    print(u'\n>>> %d de %d suite(s) com falha\n' % (len(ruins), len(arquivos)))
    for nome, falhas, saida in ruins:
        print(u'--- %s ---' % nome)
        linhas = [l for l in saida.splitlines() if u'✗' in l]
        # Estourou sem afirmacao vermelha: o fim da saida e onde esta o motivo.
        print(u'\n'.join(linhas) if linhas else u'\n'.join(saida.splitlines()[-12:]))
        print(u'')
    return 1


if __name__ == '__main__':
    sys.exit(main())
