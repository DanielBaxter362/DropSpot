import mysql.connector
import time
import os

def DBconnect():
    while True:
        try:
            # Connect to the MySQL database and specify the database
            mydb = mysql.connector.connect(
                host="mysql-35696173-dropspot.e.aivencloud.com",
                user="avnadmin",
                password="AVNS_ItCf9ga7ieYw24gVSqi",
                port=18662,
                database="defaultdb",
                ssl_ca='DropSpot/ca.pem'
            )
            print("Connected to MySQL!")
            return mydb
        except mysql.connector.Error as e:
            print("Error Connecting, retrying...")
            print(f"Error: {e}")
            time.sleep(3)
