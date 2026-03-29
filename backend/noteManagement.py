from datetime import datetime

from flask import jsonify, render_template, request, session
from mysql.connector import Error

from config import DBconnect

NOTE_CONTENT_SEPARATOR = "\n---DROPSPOT-DESC---\n"

def trimExpired():
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM notes
                WHERE createdAt < NOW() - INTERVAL 24 HOUR
                """
            )
        connection.commit()
    finally:
        connection.close()

def get_user_account(user_id):
    connection = DBconnect()
    try:
        with connection.cursor(dictionary=True) as cursor:
            cursor.execute(
                """
                SELECT userID, email
                FROM users
                WHERE userID = %s
                """,
                (user_id,),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def get_user_by_username(username):
    connection = DBconnect()
    try:
        with connection.cursor(dictionary=True) as cursor:
            cursor.execute(
                """
                SELECT userID, email
                FROM users
                WHERE email = %s
                """,
                (username,),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def get_user_notes(user_id):
    connection = DBconnect()
    try:
        with connection.cursor(dictionary=True) as cursor:
            cursor.execute(
                """
                SELECT noteID, content, latitude, longitude, hotspot, createdAt
                FROM notes
                WHERE userID = %s
                ORDER BY noteID DESC
                """,
                (user_id,),
            )
            return cursor.fetchall()
    finally:
        connection.close()


def update_user_note(user_id, note_id, content):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE notes
                SET content = %s
                WHERE noteID = %s AND userID = %s
                """,
                (content, note_id, user_id),
            )
            updated = cursor.rowcount > 0
        connection.commit()
        return updated
    finally:
        connection.close()


def delete_user_note(user_id, note_id):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM notes WHERE noteID = %s AND userID = %s",
                (note_id, user_id),
            )
            deleted = cursor.rowcount > 0
        connection.commit()
        return deleted
    finally:
        connection.close()


def update_username(user_id, username):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users
                SET email = %s
                WHERE userID = %s
                """,
                (username, user_id),
            )
            updated = cursor.rowcount > 0
        connection.commit()
        return updated
    finally:
        connection.close()


def split_note_content(content):
    raw_content = str(content or "").strip()

    if not raw_content:
        return "Untitled note", ""

    if NOTE_CONTENT_SEPARATOR in raw_content:
        title_part, description_part = raw_content.split(NOTE_CONTENT_SEPARATOR, 1)
        title = " ".join(title_part.split()).strip() or "Untitled note"
        description = description_part.strip()
        return title, description

    cleaned_content = " ".join(raw_content.split())
    return cleaned_content, cleaned_content


def combine_note_content(title, description):
    clean_title = " ".join(str(title or "").split()).strip()
    clean_description = str(description or "").strip()

    if not clean_title:
        clean_title = "Untitled note"

    if not clean_description:
        clean_description = clean_title

    return f"{clean_title}{NOTE_CONTENT_SEPARATOR}{clean_description}"


def serialize_created_at(value):
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")

    return str(value)


def serialize_note(row):
    title, description = split_note_content(row["content"] or "")

    return {
        "noteID": row["noteID"],
        "title": title,
        "description": description,
        "content": row["content"] or "",
        "latitude": float(row["latitude"]) if row["latitude"] is not None else None,
        "longitude": float(row["longitude"]) if row["longitude"] is not None else None,
        "createdAt": serialize_created_at(row.get("createdAt")),
        "hotspot": bool(row["hotspot"]),
    }


def init_note_management(app):
    @app.route("/account")
    def account():
        if not session.get("userID"):
            return render_template("login.html", message="Please log in first."), 401

        return render_template("accountDetails.html", email=session.get("email"))

    @app.route("/api/my-spots", methods=["GET"])
    def get_my_spots():
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        try:
            notes = get_user_notes(session["userID"])
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

        return jsonify({"notes": [serialize_note(note) for note in notes]}), 200

    @app.route("/api/account", methods=["GET"])
    def get_account():
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        try:
            account = get_user_account(session["userID"])
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

        if not account:
            return jsonify({"error": "User not found"}), 404

        return jsonify({"username": account["email"] or ""}), 200

    @app.route("/api/account/username", methods=["PUT"])
    def update_account_username():
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        payload = request.get_json(silent=True) or {}
        username = (payload.get("username") or "").strip()

        if not username:
            return jsonify({"error": "username is required"}), 400

        try:
            existing_user = get_user_by_username(username)

            if existing_user and existing_user["userID"] != session["userID"]:
                return jsonify({"error": "Username already taken"}), 409

            updated = update_username(session["userID"], username)
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

        if not updated:
            return jsonify({"error": "User not found"}), 404

        session["email"] = username
        return jsonify({"message": "Username updated", "username": username}), 200

    @app.route("/api/spots/<int:note_id>", methods=["PUT"])
    def update_spot(note_id):
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        payload = request.get_json(silent=True) or {}
        title = (payload.get("title") or "").strip()
        description = (payload.get("description") or "").strip()
        content = (payload.get("content") or "").strip()

        if title or description:
            content = combine_note_content(title, description)

        if not content:
            return jsonify({"error": "title or description is required"}), 400

        try:
            updated = update_user_note(session["userID"], note_id, content)
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

        if not updated:
            return jsonify({"error": "Note not found"}), 404

        return jsonify({"message": "Note updated"}), 200

    @app.route("/api/spots/<int:note_id>", methods=["DELETE"])
    def delete_spot(note_id):
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        try:
            deleted = delete_user_note(session["userID"], note_id)
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

        if not deleted:
            return jsonify({"error": "Note not found"}), 404

        return jsonify({"message": "Note deleted"}), 200
