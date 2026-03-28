import mysql.connector


HOSTNAME = "goh7hy.h.filess.io"
DATABASE = "dropspot_additionup"
PORT = "61002"
USERNAME = "dropspot_additionup"
PASSWORD = "a66f750d2e587bee465df6c853dd54ae7fe88cba"


def DBconnect():
    return mysql.connector.connect(
        host=HOSTNAME,
        database=DATABASE,
        user=USERNAME,
        password=PASSWORD,
        port=PORT,
    )


def ensure_login_table():
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS loginSystem (
                    userID INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    hashPW VARCHAR(255) NOT NULL
                )
                """
            )
        connection.commit()
    finally:
        connection.close()
