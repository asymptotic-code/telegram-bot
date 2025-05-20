create table visitor
(
    id         serial constraint visitor_pk primary key,
    tid        int  not null,
    username   varchar(255),
    is_group   boolean not null,
    created_at timestamp default now() not null
);

create unique index visitor_id_uindex
    on visitor (id);

create unique index visitor_tid_uindex
    on visitor (tid);

create table visitor_history
(
    id         serial constraint visitor_history_pk primary key,
    tid        int  not null,
    question   text not null,
    answer     text not null,
    created_at timestamp default now() not null
);

create unique index visitor_history_id_uindex
    on visitor_history (id);

create table general_log
(
    id         serial constraint general_log_pk primary key,
    tid        int  not null,
    action     text not null,
    text       text not null,
    result     text not null,
    created_at timestamp default now() not null
);

create unique index general_log_id_uindex
    on general_log (id);
