function [unix_time] = date2unixtime(utc_date)

year = utc_date(1);
month = utc_date(2);
day = utc_date(3);
hour = utc_date(4);
minute = utc_date(5);
second = utc_date(6);
%Specify day 0 
number_of_day_before_day_one=datenum(1970,01,01); %Start time of
                                                  %unix time
absolute_number_of_day=datenum(year,month,day); %Default day one for datenum is january 1st of year 0
julian_day=absolute_number_of_day - number_of_day_before_day_one; %Number of day since day one

seconds_of_day = 3600*hour+60*minute+second;
unix_time = seconds_of_day + 24*3600*julian_day;
