"""Stable fictional identities for the isolated reviewer workspace."""
from secrets import token_urlsafe

EXPERT = 'transfer-expert'
REVIEWER = 'transfer-reviewer'
LEARNER = 'transfer-learner'
HANDOFF_IDS = (LEARNER, EXPERT, REVIEWER)


def people(prefix, first_id, names):
    return tuple((first_id if index == 0 else prefix + name.lower().replace(' ', '-'), name)
                 for index, name in enumerate(names.splitlines()))


SENIORS = people('transfer-senior-', EXPERT, """Priya Shah
Miguel Torres
Noor Hassan
Gabriel Costa
Grace Kim
Arjun Mehta
Sofia Alvarez
Daniel Park
Leila Haddad
Marcus Reed
Nadia Rahman
Victor Santos
Eva Novak
Owen Brooks
Meera Iyer
Luca Romano
Fatima Saleh
Samir Desai
Lena Hoffmann
Hugo Martins
Anika Rao
Ethan Clarke
Yara Mansour
Leon Bauer
Mina Sato
Rafael Vega
Iris Chen
Nikhil Sen
Amara Okafor
Ivan Petrov
Camila Rios
Jonas Berg
Salma Farouk
Felix Weber
Amina Diallo
Tomas Silva
Julia Tan
Rohan Das
Chloe Martin
Mateo Rivera""")

JUNIORS = people('transfer-junior-', LEARNER, """Alex Chen
Maya Patel
Elena Ruiz
Jamal Carter
Tara Singh
Mason Bell
Nina Kaur
Leo Wong
Riya Kapoor
Oscar Diaz
Hana Mori
Dev Malhotra
Mia Grant
Adam Youssef
Lily Huang
Zain Ali
Sara Nasser
Caleb King
Isha Verma
Diego Luna
Emma Scott
Jin Cho
Zoe Young
Bilal Khan
Ella Murphy
Kai Tanaka
Anya Bose
Lucas Brown
Mariam Said
Jack Wilson
Sana Malik
Ben Hall
Keiko Ito
Adil Omar
Rose Miller
Elias Haddad
Neha Joshi
Max Evans
Talia Levy
Andre Ramos
Nora Walsh
Eli Green
Farah Amin
Ryan Cooper
Aisha Bell
Aria Flores
Seth Foster
Rina Gupta
Theo Price
Aya Ibrahim
Joao Rocha
Dana Ortiz
Yuki Arai
Zara Iqbal
Kyle Moore
Maryam Abbas
Alina Popov
Luis Mendez
Sonia Das
Robin Wood
Abel Cruz
Hiba Tarek
Liam Hughes
Anu Nair
Milo Gray
Noura Salem
Aaron Lim
Rana Aziz
Bea Howard
Tariq Musa
Sejal Shah
Finn Ward
Jaya Raman
Hector Soto
Lara Aziz
Emil Larsen
Uma Reddy
Rami Kamel
Yasmin Hadi
June Brooks""")

ROSTER_ROLES = {
    **dict.fromkeys((identifier for identifier, _ in SENIORS), 'senior'),
    **dict.fromkeys((identifier for identifier, _ in JUNIORS), 'junior'),
    REVIEWER: 'reviewer',
}
SWITCHABLE_IDS = (*HANDOFF_IDS, *(identifier for identifier, _ in JUNIORS[1:]))


def demo_users():
    return [
        {'id': identifier, 'name': name, 'key': token_urlsafe(36),
         'can_review': identifier in (EXPERT, REVIEWER), 'can_manage_members': identifier == EXPERT}
        for identifier, name in (*JUNIORS, *SENIORS, (REVIEWER, 'Jordan Lee'))
    ]
