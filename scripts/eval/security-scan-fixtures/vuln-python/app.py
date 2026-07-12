# FIXTURE — código propositadamente vulneravel para o eval do security-scan.
# NAO usar em producao. Nenhuma credencial aqui e real.
import os
import subprocess
import sqlite3


def get_user(conn, user_id):
    cur = conn.cursor()
    # A03 — SQL injection via f-string (CWE-89)
    cur.execute(f"SELECT * FROM users WHERE id = {user_id}")
    return cur.fetchone()


def run(cmd):
    # A03 — command injection via shell=True (CWE-78)
    return subprocess.call(cmd, shell=True)


def render(tpl):
    # A03 — code injection via eval (CWE-94)
    return eval(tpl)
