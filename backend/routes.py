import hashlib

from flask import redirect, render_template, request, session, url_for
from mysql.connector import Error

from config import DBconnect


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def get_user_by_email(email):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT userID, email, hashPW FROM users WHERE email = %s",
                (email,),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def create_user(email, password):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO users (email, hashPW) VALUES (%s, %s)",
                (email, hash_password(password)),
            )
        connection.commit()
    finally:
        connection.close()


def init_routes(app):
    @app.route("/")
    def index():
        if session.get("userID"):
            return redirect(url_for("home"))
        return redirect(url_for("login"))

    @app.route("/register", methods=["GET", "POST"])
    def register():
        message = ""

        if request.method == "POST":
            email = request.form.get("email", "")
            password = request.form.get("password", "")

            try:
                if get_user_by_email(email):
                    message = "Account already exists."
                else:
                    create_user(email, password)
                    return redirect(url_for("login"))
            except Error as e:
                print(e)
                message = "Database is busy right now. Try again in a minute."

        return render_template("register.html", message=message)

    @app.route("/login", methods=["GET", "POST"])
    def login():
        message = ""

        if request.method == "POST":
            email = request.form.get("email", "")
            password = request.form.get("password", "")
            try:
                user = get_user_by_email(email)

                if user and user[2] == hash_password(password):
                    session["userID"] = user[0]
                    session["email"] = user[1]
                    return redirect(url_for("home"))

                message = "Invalid login."
            except Error as e:
                print(e)
                message = "Database is busy right now. Try again in a minute."

        return render_template("login.html", message=message)

    @app.route("/home")
    def home():
        if not session.get("userID"):
            return redirect(url_for("login"))
        return render_template("home.html", email=session.get("email"))

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))
